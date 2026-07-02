import subprocess
import re

def parse_bbox_xml(xml):
    word_regex = re.compile(r'<word xMin="([^"]+)" yMin="([^"]+)" xMax="([^"]+)" yMax="([^"]+)">([^<]+)</word>')
    words = []
    for match in word_regex.finditer(xml):
        words.append({
            'xMin': float(match.group(1)),
            'yMin': float(match.group(2)),
            'text': match.group(5).replace('&amp;', '&').replace('&lt;', '<').replace('&gt;', '>')
        })
    return words

cmd = r'"C:\Data\Repos_Sep2020\Local_git_repo\CatRoundHelper\PdfExtractor\poppler-24.07.0\Library\bin\pdftotext.exe" -f 1 -l 1 -bbox "C:\Data\Repos_Sep2020\Local_git_repo\CatRoundHelper\2024ENGG_CAP1_CutOff.pdf" -'
xml = subprocess.check_output(cmd, shell=True).decode('utf-8', errors='ignore')
words = parse_bbox_xml(xml)

words.sort(key=lambda w: (round(w['yMin'] / 3.0), w['xMin']))

lines = []
if words:
    lines.append({'yMin': words[0]['yMin'], 'text': words[0]['text']})
    for w in words[1:]:
        if abs(w['yMin'] - lines[-1]['yMin']) <= 4.0:
            lines[-1]['text'] += " " + w['text']
        else:
            lines.append({'yMin': w['yMin'], 'text': w['text']})

for i, line in enumerate(lines[:30]):
    print(i, repr(line['text']))
