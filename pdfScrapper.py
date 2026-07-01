import pdfplumber
import pyodbc
import re
import tkinter as tk
from tkinter import filedialog, simpledialog

# --- SQL Server Configuration ---
SQL_CONN_STR = (
    "DRIVER={ODBC Driver 17 for SQL Server};"
    "SERVER=YOUR_SERVER_NAME;"
    "DATABASE=YOUR_DB_NAME;"
    "Trusted_Connection=yes;"
)

def parse_cell_data(cell_text):
    """Extracts Merit Rank and Percentile from a PDF table cell."""
    if not cell_text or cell_text.strip() == "":
        return None, None
    
    clean_text = cell_text.replace('\n', ' ').strip()
    match = re.search(r'(\d+)\s*\(\s*([0-9\.]+)\s*\)', clean_text)
    if match:
        return int(match.group(1)), float(match.group(2))
    return None, None

def roman_to_int(roman_str):
    """Converts Roman numeral stages from the PDF to integers."""
    roman_map = {'I': 1, 'II': 2, 'III': 3, 'IV': 4, 'V': 5, 'VI': 6, 'VII': 7, 'VIII': 8}
    clean_roman = str(roman_str).replace('\n', '').strip().upper()
    return roman_map.get(clean_roman, 1) # Defaults to 1 if it cannot parse

def get_user_inputs():
    """Opens UI dialogs to get the file and year from the user."""
    root = tk.Tk()
    root.withdraw() 

    # 1. Ask for File
    file_path = filedialog.askopenfilename(
        title="Select CAP Cutoff PDF File",
        filetypes=[("PDF Files", "*.pdf")]
    )
    if not file_path:
        print("No file selected. Exiting.")
        return None, None

    # 2. Ask for Year
    year = simpledialog.askinteger("Input Data Year", "Enter the Admission Year (e.g., 2024):", initialvalue=2024)
    if not year:
        print("Year not provided. Exiting.")
        return None, None

    return file_path, year

def process_pdf():
    pdf_path, year = get_user_inputs()
    if not pdf_path:
        return

    print(f"Connecting to database to insert data for Year: {year}...")
    try:
        conn = pyodbc.connect(SQL_CONN_STR)
        cursor = conn.cursor()
    except Exception as e:
        print(f"Database connection failed: {e}")
        return

    current_col_code, current_col_name = None, None
    current_br_code, current_br_name = None, None
    col_status, col_univ = "Unknown", "Unknown"

    print(f"Scanning PDF: {pdf_path}")
    
    with pdfplumber.open(pdf_path) as pdf:
        # NOTE: Remove '[:5]' to process the entire PDF instead of just the first 5 pages for testing.
        for page_num, page in enumerate(pdf.pages[:5], start=1):
            text = page.extract_text()
            if not text:
                continue

            lines = text.split('\n')
            
            # --- 1. Extract College and Branch Headers ---
            for line in lines:
                col_match = re.match(r'^(\d{4,5})\s*-\s*(.+)$', line)
                if col_match and len(line) > 20:
                    current_col_code = int(col_match.group(1).strip())
                    current_col_name = col_match.group(2).strip()

                br_match = re.match(r'^(\d{9,10})\s*-\s*(.+)$', line)
                if br_match:
                    current_br_code = int(br_match.group(1).strip())
                    current_br_name = br_match.group(2).strip()
                    
                if "Status:" in line and "Home University" in line:
                    try:
                        parts = re.split(r'Home University\s*:', line)
                        col_status = parts[0].replace("Status:", "").strip()
                        col_univ = parts[1].strip()
                    except IndexError:
                        pass

            # --- 2. Upsert Dimension Tables (College & Branch) ---
            if current_col_code and current_br_code:
                cursor.execute("""
                    IF NOT EXISTS (SELECT 1 FROM college_info WHERE College_Code = ?)
                    BEGIN
                        INSERT INTO college_info (College_Code, College_Name, Home_University, Status)
                        VALUES (?, ?, ?, ?)
                    END
                """, (current_col_code, current_col_code, current_col_name, col_univ, col_status))
                
                cursor.execute("""
                    IF NOT EXISTS (SELECT 1 FROM branch_info WHERE Branch_Code = ?)
                    BEGIN
                        INSERT INTO branch_info (Branch_Code, Branch_Name)
                        VALUES (?, ?)
                    END
                """, (current_br_code, current_br_code, current_br_name))
                
                conn.commit()

            # --- 3. Extract Tables and Insert Cutoffs ---
            tables = page.extract_tables()
            for table in tables:
                if not table or len(table) < 2:
                    continue
                
                headers = table[0]
                if headers and headers[0] and "Stage" in str(headers[0]):
                    categories = headers[1:] 
                    current_stage_int = 1 # Default starting stage
                    
                    for row in table[1:]:
                        # Check if the Stage column has a value; if yes, update current_stage_int
                        stage_cell = str(row[0]).strip() if row[0] else ""
                        if stage_cell:
                            current_stage_int = roman_to_int(stage_cell)
                            
                        for col_idx, cell in enumerate(row[1:]):
                            if col_idx < len(categories):
                                category = str(categories[col_idx]).replace('\n', '').strip()
                                if not category:
                                    continue
                                    
                                rank, percentile = parse_cell_data(cell)
                                
                                if rank and percentile and current_col_code and current_br_code:
                                    try:
                                        cursor.execute("""
                                            INSERT INTO cap_cutoffs 
                                            (Year, CAP_Round, College_Code, Branch_Code, Category, Merit_Rank, Percentile)
                                            VALUES (?, ?, ?, ?, ?, ?, ?)
                                        """, (year, current_stage_int, current_col_code, current_br_code, category, rank, percentile))
                                    except pyodbc.IntegrityError:
                                        pass
                                        
            print(f"Processed Page {page_num}")
            conn.commit()

    cursor.close()
    conn.close()
    print("\nData extraction and insertion complete!")

if __name__ == "__main__":
    process_pdf()