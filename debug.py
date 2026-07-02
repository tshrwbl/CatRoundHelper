def test_header(row_text):
    if "STATE LEVEL" in row_text or "HOME UNIVERSITY" in row_text or "CANDIDATES" in row_text:
        return False
        
    words = row_text.split()
    cat_words = [w for w in words if any(sub in w for sub in ['OPEN', 'OBC', 'SC', 'ST', 'VJ', 'NT', 'SBC', 'SEBC', 'PWD', 'DEF', 'EWS', 'TFWS', 'ORPHAN', 'STAGE']) and len(w) <= 12]
    return len(cat_words) >= 1

texts = [
    "STATE LEVEL",
    "HOME UNIVERSITY SEATS ALLOTTED TO HOME UNIVERSITY CANDIDATES",
    "STAGE GOPENS GSCS",
    "GOPENH GOBCH LOPENH",
    "L SEBCH",
    "TFWS EWS",
    "PWDROBC S"
]

for t in texts:
    print(f"'{t}': {test_header(t)}")
