import os
import re
import sys
import pdfplumber
import pyodbc
from tkinter import filedialog, Tk

# --- SQL Server Configuration ---
SQL_CONN_STR = (
    "DRIVER={ODBC Driver 17 for SQL Server};"
    "SERVER=localhost;"
    "DATABASE=CollegeData;"
    "Trusted_Connection=yes;"
)

def parse_merit_cell(merit_text):
    """
    Parses 'All India Merit' cell like '14789 (85.2493707)' into (rank, percentile).
    """
    if not merit_text or str(merit_text).strip() == "":
        return None, None
    
    clean_text = str(merit_text).replace(',', '').strip()
    match = re.search(r'(\d+)\s*\(([\d\.]+)\)', clean_text)
    if match:
        try:
            rank = int(match.group(1))
            percentile = float(match.group(2))
            return rank, percentile
        except ValueError:
            return None, None
            
    # Fallback pattern if format varies
    nums = re.findall(r'\d+(?:\.\d+)?', clean_text)
    if len(nums) >= 2:
        try:
            rank = int(nums[0])
            percentile = float(nums[1])
            return rank, percentile
        except ValueError:
            return None, None
            
    return None, None

def extract_year_and_round(filename):
    """
    Extracts Year and CAP_Round from filename, e.g., 2024ENGG_CAP1_AI_CutOff.pdf
    """
    basename = os.path.basename(filename)
    
    year_match = re.search(r'(\d{4})', basename)
    year = int(year_match.group(1)) if year_match else 2024
    
    round_match = re.search(r'CAP\s*(\d+)', basename, re.IGNORECASE)
    cap_round = int(round_match.group(1)) if round_match else 1
    
    return year, cap_round

def process_pdf(pdf_path=None):
    if not pdf_path:
        # Hide root tk window if creating dialog
        root = Tk()
        root.withdraw()
        pdf_path = filedialog.askopenfilename(title="Select All India PDF", filetypes=[("PDF", "*.pdf")])
        root.destroy()
        
    if not pdf_path or not os.path.exists(pdf_path):
        print("No valid PDF file selected.")
        return

    year, cap_round = extract_year_and_round(pdf_path)
    print(f"Processing PDF: {os.path.basename(pdf_path)}")
    print(f"Detected Year: {year}, CAP Round: {cap_round}")

    try:
        conn = pyodbc.connect(SQL_CONN_STR)
        cursor = conn.cursor()
    except Exception as e:
        print(f"Database connection failed: {e}")
        return

    total_inserted = 0

    with pdfplumber.open(pdf_path) as pdf:
        total_pages = len(pdf.pages)
        print(f"Total Pages: {total_pages}\n")

        for page_num, page in enumerate(pdf.pages, start=1):
            tables = page.extract_tables()
            if not tables:
                continue

            inserted_in_page = 0
            for table in tables:
                if not table or len(table) < 2:
                    continue

                header_row_idx = -1
                for idx, row in enumerate(table[:5]):
                    row_text = " ".join([str(c).upper() for c in row if c])
                    if "ALL INDIA" in row_text or "CHOICE CODE" in row_text or "MERIT EXAM" in row_text:
                        header_row_idx = idx
                        break

                if header_row_idx == -1:
                    continue

                for row in table[header_row_idx + 1:]:
                    if not row or len(row) < 8:
                        continue

                    merit_cell = row[1]
                    choice_code_cell = str(row[2]).strip() if row[2] else ""
                    merit_exam_cell = str(row[5]).strip() if row[5] else ""
                    type_cell = str(row[6]).strip() if row[6] else ""
                    seat_type_cell = str(row[7]).strip() if row[7] else ""

                    if not choice_code_cell or choice_code_cell.upper() == "CHOICE CODE":
                        continue

                    # Clean up multiline choice codes or spaces if any
                    choice_code = choice_code_cell.replace('\n', '').replace(' ', '')

                    rank, percentile = parse_merit_cell(merit_cell)
                    if rank is not None and percentile is not None and choice_code:
                        try:
                            cursor.execute("""
                                INSERT INTO all_india_cutoffs 
                                (Year, CAP_Round, Choice_Code, Merit_Rank, Percentile, Merit_Exam, Type, Seat_Type)
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                            """, (year, cap_round, choice_code, rank, percentile, merit_exam_cell, type_cell, seat_type_cell))
                            inserted_in_page += 1
                        except pyodbc.IntegrityError:
                            # Primary Key Duplicate / Constraint violation
                            pass

            total_inserted += inserted_in_page
            print(f"Page {page_num}/{total_pages}: Inserted {inserted_in_page} rows into all_india_cutoffs.")
            conn.commit()

    cursor.close()
    conn.close()
    print(f"\nExtraction completed successfully! Total rows inserted: {total_inserted}")

if __name__ == "__main__":
    file_arg = sys.argv[1] if len(sys.argv) > 1 else None
    process_pdf(file_arg)
