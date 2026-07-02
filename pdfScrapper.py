import pdfplumber
import pyodbc
import re
from tkinter import filedialog

# --- SQL Server Configuration ---
SQL_CONN_STR = (
    "DRIVER={ODBC Driver 17 for SQL Server};"
    "SERVER=localhost;"
    "DATABASE=CollegeData;"
    "Trusted_Connection=yes;"
)

def parse_cell_data(cell_text):
    if not cell_text or str(cell_text).strip() == "":
        return None, None
    
    clean_text = str(cell_text).replace(',', '')
    nums = re.findall(r'\d+(?:\.\d+)?', clean_text)
    
    if len(nums) >= 2:
        try:
            rank = int(nums[0])
            percentile = float(nums[1])
            
            if percentile > 100:
                s_val = str(nums[1])
                if s_val.startswith('100'):
                    percentile = float(s_val[:3] + '.' + s_val[3:])
                elif len(s_val) >= 3:
                    percentile = float(s_val[:2] + '.' + s_val[2:])
                    
            if rank >= 1 and percentile <= 100:
                return rank, percentile
        except ValueError:
            return None, None
            
    return None, None

def roman_to_int(roman_str):
    roman_map = {'I': 1, 'II': 2, 'III': 3, 'IV': 4, 'V': 5, 'VI': 6}
    clean_roman = str(roman_str).replace('\n', '').strip().upper()
    return roman_map.get(clean_roman, 1)

def extract_codes(text_chunk, cursor, current_col, current_br):
    if not text_chunk: return current_col, current_br
    lines = text_chunk.split('\n')
    for idx, line in enumerate(lines):
        col_match = re.search(r'^\s*(\d{4,5})\s*-\s*(.+)$', line)
        if col_match and len(line) > 15:
            current_col = int(col_match.group(1).strip())
            col_name = col_match.group(2).strip()
            try:
                cursor.execute("INSERT INTO college_info (College_Code, College_Name) VALUES (?, ?)", (current_col, col_name))
            except pyodbc.IntegrityError:
                pass
                
        br_match = re.search(r'^\s*(\d{9,10})\s*-\s*(.+)$', line)
        if br_match:
            current_br = int(br_match.group(1).strip())
            br_name = br_match.group(2).strip()
            
            status = None
            home_uni = None
            
            # Look ahead up to 3 lines to find Status and Home University
            for j in range(idx, min(idx+4, len(lines))):
                line_j = lines[j]
                if 'Status' in line_j:
                    if 'Home University' in line_j:
                        m = re.search(r'Status\s*:\s*(.*?)\s+Home\s+University\s*:\s*(.*)', line_j, re.IGNORECASE)
                        if m:
                            status = m.group(1).strip()
                            home_uni = m.group(2).strip()
                    else:
                        m = re.search(r'Status\s*:\s*(.*)', line_j, re.IGNORECASE)
                        if m:
                            status = m.group(1).strip()
                    break
            
            try:
                cursor.execute("INSERT INTO branch_info (Branch_Code, Branch_Name, Status, Home_University) VALUES (?, ?, ?, ?)", (current_br, br_name, status, home_uni))
            except pyodbc.IntegrityError:
                if status or home_uni:
                    cursor.execute("""
                        UPDATE branch_info 
                        SET Status = ISNULL(Status, ?), Home_University = ISNULL(Home_University, ?)
                        WHERE Branch_Code = ?
                    """, (status, home_uni, current_br))
    return current_col, current_br

def process_pdf():
    pdf_path = filedialog.askopenfilename(title="Select PDF", filetypes=[("PDF", "*.pdf")])
    if not pdf_path: return
    year = 2022

    try:
        conn = pyodbc.connect(SQL_CONN_STR)
        cursor = conn.cursor()
    except Exception as e:
        print(f"Database connection failed: {e}")
        return

    global_col_code, global_br_code = None, None
    table_settings = {"vertical_strategy": "text", "horizontal_strategy": "text", "intersection_tolerance": 15}

    with pdfplumber.open(pdf_path) as pdf:
        # NOTE: Limited to 5 pages for testing. Remove '[:5]' for the full run.
        for page_num, page in enumerate(pdf.pages, start=1):
            print(f"\n--- Scanning Page {page_num} ---")
            
            table_objs = page.find_tables()
            if not table_objs:
                table_objs = page.find_tables(table_settings)
                
            if not table_objs:
                text = page.extract_text()
                global_col_code, global_br_code = extract_codes(text, cursor, global_col_code, global_br_code)
                continue
            
            last_bottom = 0
            inserted_rows = 0
            
            for table_obj in table_objs:
                # Crop and extract text above this table to find branch/college codes
                top_crop = last_bottom
                bottom_crop = max(top_crop, table_obj.bbox[1])
                if bottom_crop > top_crop:
                    bbox = (0, top_crop, page.width, bottom_crop)
                    try:
                        cropped = page.crop(bbox)
                        text_chunk = cropped.extract_text()
                        global_col_code, global_br_code = extract_codes(text_chunk, cursor, global_col_code, global_br_code)
                    except Exception:
                        pass
                
                table = table_obj.extract()
                last_bottom = table_obj.bbox[3]
                
                if not global_col_code or not global_br_code:
                    print("   -> Missing College or Branch code. Skipping table.")
                    continue
                    
                if not table or len(table) < 2: continue
                
                # --- NEW LOGIC: Dynamically find the actual header row ---
                header_row_idx = -1
                for idx, row in enumerate(table[:5]):
                    row_text = " ".join([str(c).upper() for c in row if c])
                    
                    if "STATE LEVEL" in row_text or "HOME UNIVERSITY" in row_text or "CANDIDATES" in row_text:
                        continue
                        
                    words = row_text.split()
                    cat_words = [w for w in words if any(sub in w for sub in ['OPEN', 'OBC', 'SC', 'ST', 'VJ', 'NT', 'SBC', 'SEBC', 'PWD', 'DEF', 'EWS', 'TFWS', 'ORPHAN', 'STAGE']) and len(w) <= 12]
                    
                    if len(cat_words) >= 1:
                        header_row_idx = idx
                        break
                
                if header_row_idx == -1:
                    continue # Skip if it's a random visual table without categories
                    
                headers = table[header_row_idx]
                current_stage_int = 1
                
                # --- Read data ONLY from the rows below the found headers ---
                for row in table[header_row_idx + 1:]:
                    stage_cell = str(row[0]).strip() if row[0] else ""
                    if stage_cell and stage_cell.upper() in ['I', 'II', 'III']:
                        current_stage_int = roman_to_int(stage_cell)
                        
                    for col_idx, cell in enumerate(row):
                        # Ensure we don't go out of bounds
                        if col_idx < len(headers):
                            category = str(headers[col_idx]).replace('\n', '').strip()
                            
                            # Skip if column header is empty or is the word 'Stage'
                            if not category or category.upper() == "STAGE" or category == "None": 
                                continue
                                
                            rank, percentile = parse_cell_data(cell)
                            
                            if rank and percentile:
                                try:
                                    cursor.execute("""
                                        INSERT INTO cap_cutoffs 
                                        (Year, CAP_Round, College_Code, Branch_Code, Category, Merit_Rank, Percentile)
                                        VALUES (?, ?, ?, ?, ?, ?, ?)
                                    """, (year, current_stage_int, global_col_code, global_br_code, category, rank, percentile))
                                    inserted_rows += 1
                                except pyodbc.IntegrityError as e:
                                    if 'FK_' in str(e):
                                        print(f"   -> Foreign Key Error (Missing Code in branch/college table): {e}")
                                    pass # Ignores PK duplicates silently

            # Check text after the last table on the page for branch codes applying to the next page
            try:
                top_crop = last_bottom
                bottom_crop = max(top_crop, page.height)
                if bottom_crop > top_crop:
                    bbox = (0, top_crop, page.width, bottom_crop)
                    cropped = page.crop(bbox)
                    text_chunk = cropped.extract_text()
                    global_col_code, global_br_code = extract_codes(text_chunk, cursor, global_col_code, global_br_code)
            except Exception:
                pass

            print(f"-> Inserted {inserted_rows} rows into cap_cutoffs from Page {page_num}.")
            conn.commit()

    cursor.close()
    conn.close()
    print("\nExtraction finished!")

if __name__ == "__main__":
    process_pdf()