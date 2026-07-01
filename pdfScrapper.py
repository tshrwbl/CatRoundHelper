import pdfplumber
import pyodbc
import re
import tkinter as tk
from tkinter import filedialog, simpledialog

# --- SQL Server Configuration ---
SQL_CONN_STR = (
    "DRIVER={ODBC Driver 17 for SQL Server};"
    "SERVER=localhost;"
    "DATABASE=CollegeData;"
    "Trusted_Connection=yes;"
)

def parse_cell_data(cell_text):
    if not cell_text or cell_text.strip() == "":
        return None, None
    clean_text = cell_text.replace('\n', ' ').strip()
    match = re.search(r'(\d+)\s*\(\s*([0-9\.]+)\s*\)', clean_text)
    if match:
        return int(match.group(1)), float(match.group(2))
    return None, None

def roman_to_int(roman_str):
    roman_map = {'I': 1, 'II': 2, 'III': 3, 'IV': 4, 'V': 5, 'VI': 6, 'VII': 7, 'VIII': 8}
    clean_roman = str(roman_str).replace('\n', '').strip().upper()
    return roman_map.get(clean_roman, 1)

def process_pdf():
    # Hardcoded for quick testing, replace with UI prompts later if needed
    pdf_path = filedialog.askopenfilename(title="Select PDF", filetypes=[("PDF", "*.pdf")])
    if not pdf_path: return
    year = 2024

    try:
        conn = pyodbc.connect(SQL_CONN_STR)
        cursor = conn.cursor()
    except Exception as e:
        print(f"Database connection failed: {e}")
        return

    current_col_code, current_col_name = None, None
    current_br_code, current_br_name = None, None

    # Custom table settings for DTE PDFs (helps if border lines are missing)
    table_settings = {
        "vertical_strategy": "text", 
        "horizontal_strategy": "text",
        "intersection_tolerance": 15
    }

    with pdfplumber.open(pdf_path) as pdf:
        for page_num, page in enumerate(pdf.pages[:5], start=1):
            print(f"\n--- Scanning Page {page_num} ---")
            text = page.extract_text()
            if not text: continue
            
            # 1. Look for College and Branch
            for line in text.split('\n'):
                # Using more forgiving regex with \s*
                col_match = re.search(r'^\s*(\d{4,5})\s*-\s*(.+)$', line)
                if col_match and len(line) > 15:
                    current_col_code = int(col_match.group(1).strip())
                    current_col_name = col_match.group(2).strip()
                    print(f"-> Found College: {current_col_code} - {current_col_name[:30]}...")

                br_match = re.search(r'^\s*(\d{9,10})\s*-\s*(.+)$', line)
                if br_match:
                    current_br_code = int(br_match.group(1).strip())
                    current_br_name = br_match.group(2).strip()
                    print(f"-> Found Branch: {current_br_code} - {current_br_name[:30]}...")

            if not current_col_code or not current_br_code:
                print("-> WARNING: Could not find College or Branch on this page. Skipping data extraction.")
                continue
                
            # Upsert Dimension Tables
            cursor.execute("""
                IF NOT EXISTS (SELECT 1 FROM college_info WHERE College_Code = ?)
                BEGIN INSERT INTO college_info (College_Code, College_Name) VALUES (?, ?) END
            """, (current_col_code, current_col_code, current_col_name))
            
            cursor.execute("""
                IF NOT EXISTS (SELECT 1 FROM branch_info WHERE Branch_Code = ?)
                BEGIN INSERT INTO branch_info (Branch_Code, Branch_Name) VALUES (?, ?) END
            """, (current_br_code, current_br_code, current_br_name))
            conn.commit()

            # 2. Extract Tables
            # Try default extraction first, if it fails, try custom text-based extraction
            tables = page.extract_tables()
            if not tables:
                tables = page.extract_tables(table_settings)

            print(f"-> Found {len(tables)} tables on page {page_num}.")
            
            inserted_rows = 0
            for t_idx, table in enumerate(tables):
                if not table or len(table) < 2: continue
                
                headers = table[0]
                header_str = " | ".join([str(h).replace('\n', '') for h in headers if h])
                print(f"   Table {t_idx} Headers: {header_str[:80]}...")

                # Look for "Stage" in the first or second column
                if headers and any("Stage" in str(h) for h in headers[:2] if h):
                    categories = headers[1:] 
                    current_stage_int = 1
                    
                    for row in table[1:]:
                        stage_cell = str(row[0]).strip() if row[0] else ""
                        if stage_cell and stage_cell.upper() in ['I', 'II', 'III']:
                            current_stage_int = roman_to_int(stage_cell)
                            
                        for col_idx, cell in enumerate(row[1:]):
                            if col_idx < len(categories):
                                category = str(categories[col_idx]).replace('\n', '').strip()
                                if not category: continue
                                    
                                rank, percentile = parse_cell_data(cell)
                                
                                if rank and percentile:
                                    try:
                                        cursor.execute("""
                                            INSERT INTO cap_cutoffs 
                                            (Year, CAP_Round, College_Code, Branch_Code, Category, Merit_Rank, Percentile)
                                            VALUES (?, ?, ?, ?, ?, ?, ?)
                                        """, (year, current_stage_int, current_col_code, current_br_code, category, rank, percentile))
                                        inserted_rows += 1
                                    except pyodbc.IntegrityError as e:
                                        # Now we print the DB error instead of hiding it!
                                        if "Violation of PRIMARY KEY" not in str(e):
                                            print(f"   DB ERROR inserting {category}: {e}")
                                            
            print(f"-> Successfully inserted {inserted_rows} rows into cap_cutoffs from Page {page_num}.")
            conn.commit()

    cursor.close()
    conn.close()
    print("\nExtraction finished!")

if __name__ == "__main__":
    process_pdf()