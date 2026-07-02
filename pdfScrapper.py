import pdfplumber
import re
import pyodbc
from tkinter import filedialog
from tqdm import tqdm
import concurrent.futures

# --- Database Connection String ---
SQL_CONN_STR = (
    "DRIVER={ODBC Driver 17 for SQL Server};"
    "SERVER=localhost;"
    "DATABASE=CollegeData;"
    "Trusted_Connection=yes;"
)

def roman_to_int(roman):
    roman_map = {'I': 1, 'II': 2, 'III': 3, 'IV': 4, 'V': 5}
    return roman_map.get(roman.upper(), 1)

def parse_cell_data(cell):
    if not cell: return None, None
    lines = cell.strip().split('\n')
    if len(lines) >= 2:
        try:
            rank = int(re.sub(r'\D', '', lines[0]))
            percentile_str = re.sub(r'[^\d.]', '', lines[1])
            percentile = float(percentile_str) if percentile_str else None
            return rank, percentile
        except ValueError:
            pass
    elif len(lines) == 1:
        match = re.search(r'(\d+)\s*\(([\d.]+)\)', lines[0])
        if match:
            return int(match.group(1)), float(match.group(2))
    return None, None

def extract_codes_stateless(text_chunk):
    # Returns (colleges, branches, current_col, current_br)
    
    if not text_chunk: return [], [], None, None
    colleges = []
    branches = []
    current_col = None
    current_br = None
    
    lines = text_chunk.split('\n')
    for idx, line in enumerate(lines):
        col_match = re.search(r'^\s*(\d{4,5})\s*-\s*(.+)$', line)
        if col_match and len(line) > 15:
            current_col = int(col_match.group(1).strip())
            col_name = col_match.group(2).strip()
            colleges.append((current_col, col_name))
                
        br_match = re.search(r'^\s*(\d{9,10})\s*-\s*(.+)$', line)
        if br_match:
            current_br = int(br_match.group(1).strip())
            br_name = br_match.group(2).strip()
            
            status = None
            home_uni = None
            
            # Look ahead up to 3 lines
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
            branches.append((current_br, br_name, status, home_uni))
    return colleges, branches, current_col, current_br

def process_page(args):
    pdf_path, page_num = args
    page_data = {
        'page_num': page_num,
        'colleges': [],
        'branches': [],
        'cutoff_rows': [], # List of (stage, category, rank, percentile, col_code_at_extraction, br_code_at_extraction)
        'final_col_code': None,
        'final_br_code': None
    }
    
    table_settings = {"vertical_strategy": "text", "horizontal_strategy": "text", "intersection_tolerance": 15}
    
    with pdfplumber.open(pdf_path) as pdf:
        page = pdf.pages[page_num - 1]
        
        table_objs = page.find_tables()
        if not table_objs:
            text_chunk = page.extract_text()
            if text_chunk:
                cols, brs, c_col, c_br = extract_codes_stateless(text_chunk)
                page_data['colleges'].extend(cols)
                page_data['branches'].extend(brs)
                page_data['final_col_code'] = c_col
                page_data['final_br_code'] = c_br
            return page_data
            
        current_col = None
        current_br = None
        
        # Check text before the first table
        try:
            top_crop = 0
            bottom_crop = min(table_objs[0].bbox[1], page.height)
            if bottom_crop > top_crop:
                bbox = (0, top_crop, page.width, bottom_crop)
                cropped = page.crop(bbox)
                text_chunk = cropped.extract_text()
                cols, brs, c_col, c_br = extract_codes_stateless(text_chunk)
                page_data['colleges'].extend(cols)
                page_data['branches'].extend(brs)
                if c_col: current_col = c_col
                if c_br: current_br = c_br
        except Exception:
            pass
            
        for i, table_obj in enumerate(table_objs):
            # Extract text between previous table and this table
            if i > 0:
                try:
                    top_crop = table_objs[i-1].bbox[3]
                    bottom_crop = min(table_obj.bbox[1], page.height)
                    if bottom_crop > top_crop:
                        bbox = (0, top_crop, page.width, bottom_crop)
                        cropped = page.crop(bbox)
                        text_chunk = cropped.extract_text()
                        cols, brs, c_col, c_br = extract_codes_stateless(text_chunk)
                        page_data['colleges'].extend(cols)
                        page_data['branches'].extend(brs)
                        if c_col: current_col = c_col
                        if c_br: current_br = c_br
                except Exception:
                    pass
            
            table = table_obj.extract(**table_settings)
            if not table or len(table) < 2:
                continue

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
                continue
                
            headers = table[header_row_idx]
            current_stage_int = 1
            
            for row in table[header_row_idx + 1:]:
                stage_cell = str(row[0]).strip() if row[0] else ""
                if stage_cell and stage_cell.upper() in ['I', 'II', 'III']:
                    current_stage_int = roman_to_int(stage_cell)
                    
                for col_idx, cell in enumerate(row):
                    if col_idx < len(headers):
                        category = str(headers[col_idx]).replace('\n', '').strip()
                        if not category or category.upper() == "STAGE" or category == "NONE": 
                            continue
                            
                        rank, percentile = parse_cell_data(cell)
                        if rank and percentile:
                            page_data['cutoff_rows'].append((current_stage_int, category, rank, percentile, current_col, current_br))

        # Check text after the last table
        try:
            top_crop = table_objs[-1].bbox[3]
            bottom_crop = max(top_crop, page.height)
            if bottom_crop > top_crop:
                bbox = (0, top_crop, page.width, bottom_crop)
                cropped = page.crop(bbox)
                text_chunk = cropped.extract_text()
                cols, brs, c_col, c_br = extract_codes_stateless(text_chunk)
                page_data['colleges'].extend(cols)
                page_data['branches'].extend(brs)
                if c_col: current_col = c_col
                if c_br: current_br = c_br
        except Exception:
            pass

        page_data['final_col_code'] = current_col
        page_data['final_br_code'] = current_br
        
    return page_data

def process_pdf():
    pdf_path = filedialog.askopenfilename(title="Select PDF", filetypes=[("PDF", "*.pdf")])
    if not pdf_path: return
    year = 2024

    # 1. Determine total pages
    with pdfplumber.open(pdf_path) as pdf:
        total_pages = len(pdf.pages)
        
    print(f"Discovered {total_pages} pages in PDF. Starting parallel extraction...")

    # 2. Extract in parallel
    page_results = []
    with concurrent.futures.ProcessPoolExecutor() as executor:
        args_list = [(pdf_path, p) for p in range(1, total_pages + 1)]
        for result in tqdm(executor.map(process_page, args_list), total=total_pages, desc="Extracting PDF"):
            page_results.append(result)
            
    # Sort results to ensure we process sequentially
    page_results.sort(key=lambda x: x['page_num'])

    # 3. Sequential DB Insertion
    print("\nConnecting to database and inserting data...")
    try:
        conn = pyodbc.connect(SQL_CONN_STR)
        cursor = conn.cursor()
    except Exception as e:
        print(f"Database connection failed: {e}")
        return

    global_col_code = None
    global_br_code = None
    
    page_insert_counts = {}

    for page_data in tqdm(page_results, desc="Inserting into DB"):
        p_num = page_data['page_num']
        rows_inserted = 0
        
        # Insert Colleges
        for col_code, col_name in page_data['colleges']:
            try:
                cursor.execute("INSERT INTO college_info (College_Code, College_Name) VALUES (?, ?)", (col_code, col_name))
            except pyodbc.IntegrityError:
                pass
                
        # Insert Branches
        for br_code, br_name, status, home_uni in page_data['branches']:
            try:
                cursor.execute("INSERT INTO branch_info (Branch_Code, Branch_Name, Status, Home_University) VALUES (?, ?, ?, ?)", (br_code, br_name, status, home_uni))
            except pyodbc.IntegrityError:
                if status or home_uni:
                    cursor.execute("""
                        UPDATE branch_info 
                        SET Status = ISNULL(Status, ?), Home_University = ISNULL(Home_University, ?)
                        WHERE Branch_Code = ?
                    """, (status, home_uni, br_code))

        # Insert Cutoffs
        for row in page_data['cutoff_rows']:
            stage, category, rank, percentile, tbl_col, tbl_br = row
            
            # Resolve the codes
            resolved_col = tbl_col if tbl_col is not None else global_col_code
            resolved_br = tbl_br if tbl_br is not None else global_br_code
            
            try:
                cursor.execute("""
                    INSERT INTO cap_cutoffs 
                    (Year, CAP_Round, College_Code, Branch_Code, Category, Merit_Rank, Percentile)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                """, (year, stage, resolved_col, resolved_br, category, rank, percentile))
                rows_inserted += 1
            except pyodbc.IntegrityError as e:
                pass
                
        page_insert_counts[p_num] = rows_inserted
        
        if page_data['final_col_code'] is not None:
            global_col_code = page_data['final_col_code']
        if page_data['final_br_code'] is not None:
            global_br_code = page_data['final_br_code']
            
        conn.commit()

    cursor.close()
    conn.close()
    
    print("\nExtraction & Insertion Finished!\n")
    print("--- Summary ---")
    for p_num, count in page_insert_counts.items():
        if count > 0:
            print(f"Page {p_num}: {count} rows inserted")
    print(f"Total rows inserted: {sum(page_insert_counts.values())}")

if __name__ == "__main__":
    process_pdf()