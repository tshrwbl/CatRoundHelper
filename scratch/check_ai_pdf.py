import pdfplumber

pdf_path = r"c:\Data\Repos_Sep2020\Local_git_repo\CatRoundHelper\2024ENGG_CAP1_AI_CutOff.pdf"
with pdfplumber.open(pdf_path) as pdf:
    print(f"Total pages: {len(pdf.pages)}")
    for i in range(min(5, len(pdf.pages))):
        print(f"\n--- Page {i+1} ---")
        page = pdf.pages[i]
        tables = page.extract_tables()
        print(f"Found {len(tables)} tables")
        for table_idx, table in enumerate(tables):
            print(f"Table {table_idx+1} has {len(table)} rows, first 3 rows:")
            for row in table[:3]:
                print(row)
