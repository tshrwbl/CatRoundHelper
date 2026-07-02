#include <iostream>
#include <fstream>
#include <string>
#include <vector>
#include <regex>
#include <thread>
#include <future>
#include <algorithm>
#include <map>
#include <sstream>
#define NOMINMAX
#include <windows.h>
#include <commdlg.h>
#include <sql.h>
#include <sqlext.h>
#include <mutex>

struct WordBox {
    double xMin, yMin, xMax, yMax;
    std::string text;
};

struct CutoffRow {
    int stage;
    std::string category;
    int rank;
    double percentile;
    int col_code;
    long long br_code;
};

struct PageData {
    int page_num;
    std::vector<std::pair<int, std::string>> colleges;
    std::vector<std::tuple<long long, std::string, std::string, std::string>> branches;
    std::vector<CutoffRow> cutoff_rows;
    int final_col_code = 0;
    long long final_br_code = 0;
};

// Helper to run command and capture output
std::string exec(const char* cmd) {
    std::string result = "";
    FILE* pipe = _popen(cmd, "r");
    if (!pipe) return "";
    char buffer[4096];
    while (fgets(buffer, sizeof(buffer), pipe) != nullptr) {
        result += buffer;
    }
    _pclose(pipe);
    return result;
}

std::string find_poppler_dir() {
    char buffer[MAX_PATH];
    GetModuleFileNameA(NULL, buffer, MAX_PATH);
    std::string path(buffer);
    
    // Traverse up to 4 levels to find the poppler folder
    for (int i = 0; i < 4; ++i) {
        size_t pos = path.find_last_of("\\/");
        if (pos == std::string::npos) break;
        path = path.substr(0, pos);
        std::string test_path = path + "\\poppler-24.07.0\\Library\\bin";
        DWORD attrib = GetFileAttributesA(test_path.c_str());
        if (attrib != INVALID_FILE_ATTRIBUTES && (attrib & FILE_ATTRIBUTE_DIRECTORY)) {
            return test_path;
        }
    }
    // Fallback relative to current working directory
    return "poppler-24.07.0\\Library\\bin";
}

int get_total_pages(const std::string& pdf_path, const std::string& poppler_dir) {
    // Wrap entire command in quotes to prevent cmd.exe from stripping the first and last quotes
    std::string cmd = "\"\"" + poppler_dir + "\\pdfinfo.exe\" \"" + pdf_path + "\"\"";
    std::string output = exec(cmd.c_str());
    std::regex page_regex(R"(Pages:\s+(\d+))");
    std::smatch m;
    if (std::regex_search(output, m, page_regex)) {
        return std::stoi(m[1].str());
    }
    return 100; // Fallback
}

std::vector<WordBox> parse_bbox_xml(const std::string& xml) {
    std::vector<WordBox> words;
    std::regex word_regex("<word xMin=\"([^\"]+)\" yMin=\"([^\"]+)\" xMax=\"([^\"]+)\" yMax=\"([^\"]+)\">([^<]+)</word>");
    auto words_begin = std::sregex_iterator(xml.begin(), xml.end(), word_regex);
    auto words_end = std::sregex_iterator();

    for (std::sregex_iterator i = words_begin; i != words_end; ++i) {
        std::smatch match = *i;
        WordBox w;
        w.xMin = std::stod(match[1].str());
        w.yMin = std::stod(match[2].str());
        w.xMax = std::stod(match[3].str());
        w.yMax = std::stod(match[4].str());
        w.text = match[5].str();
        words.push_back(w);
    }
    return words;
}

int roman_to_int(const std::string& roman) {
    if (roman == "I") return 1;
    if (roman == "II") return 2;
    if (roman == "III") return 3;
    if (roman == "IV") return 4;
    if (roman == "V") return 5;
    return 1;
}

void parse_cell_data(const std::string& cell, int& rank, double& percentile) {
    rank = 0; percentile = 0.0;
    std::regex r1(R"((\d+)\s*\(([\d.]+)\))");
    std::smatch m;
    if (std::regex_search(cell, m, r1)) {
        rank = std::stoi(m[1].str());
        percentile = std::stod(m[2].str());
    } else {
        std::istringstream iss(cell);
        std::string line;
        std::vector<std::string> lines;
        while (std::getline(iss, line, '\n')) {
            if (!line.empty()) lines.push_back(line);
        }
        if (lines.size() >= 2) {
            try {
                std::string rank_str = std::regex_replace(lines[0], std::regex(R"(\D)"), "");
                std::string perc_str = std::regex_replace(lines[1], std::regex(R"([^\d.])"), "");
                if (!rank_str.empty() && !perc_str.empty()) {
                    rank = std::stoi(rank_str);
                    percentile = std::stod(perc_str);
                }
            } catch (...) {}
        }
    }
}

PageData process_page(const std::string& pdf_path, int page_num, const std::string& poppler_dir) {
    PageData data;
    data.page_num = page_num;

    // Wrap entire command in quotes to prevent cmd.exe from stripping the first and last quotes
    std::string cmd = "\"\"" + poppler_dir + "\\pdftotext.exe\" -f " + std::to_string(page_num) + 
                      " -l " + std::to_string(page_num) + " -bbox \"" + pdf_path + "\" -\"";
    
    std::string xml = exec(cmd.c_str());
    if (xml.empty()) return data;

    std::vector<WordBox> words = parse_bbox_xml(xml);
    if (words.empty()) return data;

    std::sort(words.begin(), words.end(), [](const WordBox& a, const WordBox& b) {
        long long bucket_a = std::lround(a.yMin / 4.0);
        long long bucket_b = std::lround(b.yMin / 4.0);
        if (bucket_a != bucket_b) return bucket_a < bucket_b;
        return a.xMin < b.xMin;
    });

    struct Line {
        double yMin;
        std::vector<WordBox> words;
        std::string full_text;
    };

    std::vector<Line> lines;
    if (!words.empty()) {
        lines.push_back({words[0].yMin, {words[0]}, words[0].text});
        for (size_t i = 1; i < words.size(); ++i) {
            if (std::abs(words[i].yMin - lines.back().yMin) <= 4.0) {
                lines.back().words.push_back(words[i]);
                lines.back().full_text += " " + words[i].text;
            } else {
                lines.push_back({words[i].yMin, {words[i]}, words[i].text});
            }
        }
    }

    int current_col = 0;
    long long current_br = 0;
    std::regex col_regex(R"(^\s*(\d{4,5})\s*-\s*(.+)$)");
    std::regex br_regex(R"(^\s*(\d{9,10})\s*-\s*(.+)$)");
    std::regex status_home_regex(R"(Status\s*:\s*(.*?)\s+Home\s+University\s*:\s*(.*))");
    std::regex status_only_regex(R"(Status\s*:\s*(.*))");

    struct ColumnHeader {
        std::string name;
        double xCenter;
    };
    std::vector<ColumnHeader> current_headers;
    int current_stage = 1;
    bool in_table = false;
    double last_header_y = 0;

    for (size_t i = 0; i < lines.size(); ++i) {
        std::smatch match;
        std::string line_text = lines[i].full_text;

        if (std::regex_search(line_text, match, col_regex) && line_text.length() > 15) {
            current_col = std::stoi(match[1].str());
            data.colleges.push_back({current_col, match[2].str()});
            in_table = false;
            continue;
        }
        else if (std::regex_search(line_text, match, br_regex)) {
            current_br = std::stoll(match[1].str());
            std::string br_name = match[2].str();
            std::string status = "", home_uni = "";
            for (size_t j = i; j < (std::min)(i + 4, lines.size()); ++j) {
                std::string lookahead = lines[j].full_text;
                if (lookahead.find("Status") != std::string::npos) {
                    std::smatch sm;
                    if (std::regex_search(lookahead, sm, status_home_regex)) {
                        status = sm[1].str();
                        home_uni = sm[2].str();
                    } else if (std::regex_search(lookahead, sm, status_only_regex)) {
                        status = sm[1].str();
                    }
                    break;
                }
            }
            data.branches.push_back({current_br, br_name, status, home_uni});
            in_table = false;
            continue;
        }

        std::string upper_text = line_text;
        std::transform(upper_text.begin(), upper_text.end(), upper_text.begin(), ::toupper);
        
        if (upper_text.find("STATE LEVEL") != std::string::npos || 
            upper_text.find("HOME UNIVERSITY") != std::string::npos ||
            upper_text.find("CANDIDATES") != std::string::npos) {
            continue;
        }

        std::vector<std::string> cat_keywords = {"OPEN", "OBC", "SC", "ST", "VJ", "NT", "SBC", "SEBC", "PWD", "DEF", "EWS", "TFWS", "ORPHAN"};
        bool has_cat = false;
        for (const auto& w : lines[i].words) {
            std::string w_up = w.text;
            std::transform(w_up.begin(), w_up.end(), w_up.begin(), ::toupper);
            for (const auto& kw : cat_keywords) {
                if (w_up.find(kw) != std::string::npos && w_up.length() <= 12) {
                    has_cat = true; break;
                }
            }
            if(has_cat) break;
        }

        if (has_cat) {
            current_headers.clear();
            for (const auto& w : lines[i].words) {
                std::string w_up = w.text;
                std::transform(w_up.begin(), w_up.end(), w_up.begin(), ::toupper);
                if (w_up != "STAGE" && w_up != "NONE") {
                    current_headers.push_back({w_up, (w.xMin + w.xMax) / 2.0});
                }
            }
            in_table = true;
            last_header_y = lines[i].yMin;
            continue;
        }

        if (in_table && !current_headers.empty() && lines[i].yMin > last_header_y) {
            if (lines[i].words.empty()) continue;
            
            std::string first_word = lines[i].words[0].text;
            std::transform(first_word.begin(), first_word.end(), first_word.begin(), ::toupper);
            if (first_word == "I" || first_word == "II" || first_word == "III") {
                current_stage = roman_to_int(first_word);
            }

            for (const auto& w : lines[i].words) {
                if (w.text == "I" || w.text == "II" || w.text == "III") continue;
                
                double w_center = (w.xMin + w.xMax) / 2.0;
                int best_col = -1;
                double min_dist = 9999.0;
                
                for (size_t h = 0; h < current_headers.size(); ++h) {
                    double dist = std::abs(w_center - current_headers[h].xCenter);
                    if (dist < min_dist && dist < 120.0) { // Large tolerance
                        min_dist = dist;
                        best_col = static_cast<int>(h);
                    }
                }
                
                if (best_col != -1) {
                    // Find corresponding percentile word directly below this rank word
                    double perc = 0.0;
                    double p_min_dist = 9999.0;
                    if (i + 1 < lines.size()) {
                        for (const auto& pw : lines[i+1].words) {
                            double p_dist = std::abs(((pw.xMin + pw.xMax)/2.0) - w_center);
                            if (p_dist < p_min_dist && p_dist < 60.0) {
                                p_min_dist = p_dist;
                                std::string p_text = std::regex_replace(pw.text, std::regex(R"([^\d.])"), "");
                                if (!p_text.empty()) {
                                    try { perc = std::stod(p_text); } catch(...) {}
                                }
                            }
                        }
                    }
                    
                    int rk = 0;
                    try { rk = std::stoi(std::regex_replace(w.text, std::regex(R"(\D)"), "")); } catch(...) {}
                    if (rk > 0) {
                        data.cutoff_rows.push_back({current_stage, current_headers[best_col].name, rk, perc, current_col, current_br});
                    }
                }
            }
        }
    }

    data.final_col_code = current_col;
    data.final_br_code = current_br;
    return data;
}

// Very basic error reporting for ODBC
void extract_error(std::string fn, SQLHANDLE handle, SQLSMALLINT type) {
    SQLINTEGER i = 0;
    SQLINTEGER native;
    SQLCHAR state[ 7 ];
    SQLCHAR text[256];
    SQLSMALLINT len;
    SQLRETURN ret;

    do {
        ret = SQLGetDiagRecA(type, handle, ++i, state, &native, text, sizeof(text), &len );
        if (SQL_SUCCEEDED(ret)) {
            // Uncomment to debug DB errors:
            // std::cerr << fn << ": " << state << ":" << i << ":" << native << ":" << text << std::endl;
        }
    } while( ret == SQL_SUCCESS );
}

void insert_results_odbc(std::vector<PageData>& pages, int year) {
    SQLHENV env;
    SQLHDBC dbc;
    SQLHSTMT stmt_col, stmt_br, stmt_cutoff;
    SQLAllocHandle(SQL_HANDLE_ENV, SQL_NULL_HANDLE, &env);
    SQLSetEnvAttr(env, SQL_ATTR_ODBC_VERSION, (void*)SQL_OV_ODBC3, 0);
    SQLAllocHandle(SQL_HANDLE_DBC, env, &dbc);
    
    SQLCHAR out_conn_str[1024];
    SQLSMALLINT out_len;
    SQLCHAR* in_conn_str = (SQLCHAR*)"DRIVER={ODBC Driver 17 for SQL Server};SERVER=localhost;DATABASE=CollegeData;Trusted_Connection=yes;";
    
    SQLRETURN ret = SQLDriverConnectA(dbc, NULL, in_conn_str, SQL_NTS, out_conn_str, 1024, &out_len, SQL_DRIVER_NOPROMPT);
    if (!SQL_SUCCEEDED(ret)) {
        std::cerr << "Failed to connect to database. Check if ODBC driver is installed and server is running." << std::endl;
        extract_error("SQLDriverConnectA", dbc, SQL_HANDLE_DBC);
        return;
    }
    
    SQLAllocHandle(SQL_HANDLE_STMT, dbc, &stmt_col);
    SQLAllocHandle(SQL_HANDLE_STMT, dbc, &stmt_br);
    SQLAllocHandle(SQL_HANDLE_STMT, dbc, &stmt_cutoff);

    // Global state
    int global_col_code = 0;
    
    // Sort pages sequentially for proper state carry-over
    std::sort(pages.begin(), pages.end(), [](const PageData& a, const PageData& b){
        return a.page_num < b.page_num;
    });

    std::cout << "Data extraction complete. Extracted items across all pages:" << std::endl;
    int total_c = 0, total_b = 0, total_r = 0;
    for (const auto& pd : pages) {
        total_c += static_cast<int>(pd.colleges.size());
        total_b += static_cast<int>(pd.branches.size());
        total_r += static_cast<int>(pd.cutoff_rows.size());
    }
    std::cout << "Colleges: " << total_c << ", Branches: " << total_b << ", Cutoffs: " << total_r << std::endl;

    global_col_code = 0;
    long long global_br_code = 0;

    int total_inserted = 0;

    for (const auto& pd : pages) {
        for (const auto& col : pd.colleges) {
            std::string q = "INSERT INTO college_info (College_Code, College_Name) VALUES (?, ?)";
            SQLPrepareA(stmt_col, (SQLCHAR*)q.c_str(), SQL_NTS);
            SQLINTEGER colCode = col.first;
            std::string colName = col.second;
            SQLLEN cbName = SQL_NTS, cbCode = 0;
            SQLBindParameter(stmt_col, 1, SQL_PARAM_INPUT, SQL_C_LONG, SQL_INTEGER, 0, 0, &colCode, 0, &cbCode);
            SQLBindParameter(stmt_col, 2, SQL_PARAM_INPUT, SQL_C_CHAR, SQL_VARCHAR, colName.length(), 0, (SQLPOINTER)colName.c_str(), colName.length(), &cbName);
            
            SQLRETURN ret = SQLExecute(stmt_col);
            if (!SQL_SUCCEEDED(ret) && ret != SQL_NO_DATA) {
                // Ignore PK constraint failures (23000)
            }
            SQLFreeStmt(stmt_col, SQL_RESET_PARAMS);
        }

        for (const auto& br : pd.branches) {
            std::string q = "INSERT INTO branch_info (Branch_Code, Branch_Name, Status, Home_University) VALUES (?, ?, ?, ?)";
            SQLPrepareA(stmt_br, (SQLCHAR*)q.c_str(), SQL_NTS);
            long long brCode = std::get<0>(br);
            std::string brName = std::get<1>(br);
            std::string status = std::get<2>(br);
            std::string home_uni = std::get<3>(br);
            
            SQLLEN cbCode = 0, cbName = SQL_NTS, cbStat = SQL_NTS, cbUni = SQL_NTS;
            SQLBindParameter(stmt_br, 1, SQL_PARAM_INPUT, SQL_C_SBIGINT, SQL_BIGINT, 0, 0, &brCode, 0, &cbCode);
            SQLBindParameter(stmt_br, 2, SQL_PARAM_INPUT, SQL_C_CHAR, SQL_VARCHAR, brName.length(), 0, (SQLPOINTER)brName.c_str(), brName.length(), &cbName);
            SQLBindParameter(stmt_br, 3, SQL_PARAM_INPUT, SQL_C_CHAR, SQL_VARCHAR, status.length(), 0, (SQLPOINTER)status.c_str(), status.length(), &cbStat);
            SQLBindParameter(stmt_br, 4, SQL_PARAM_INPUT, SQL_C_CHAR, SQL_VARCHAR, home_uni.length(), 0, (SQLPOINTER)home_uni.c_str(), home_uni.length(), &cbUni);
            
            SQLRETURN ret = SQLExecute(stmt_br);
            if (!SQL_SUCCEEDED(ret) && ret != SQL_NO_DATA) {
                // Ignore PK constraint failures
            }
            SQLFreeStmt(stmt_br, SQL_RESET_PARAMS);
        }

        for (const auto& row : pd.cutoff_rows) {
            std::string q = "INSERT INTO cap_cutoffs (Year, CAP_Round, College_Code, Branch_Code, Category, Merit_Rank, Percentile) VALUES (?, ?, ?, ?, ?, ?, ?)";
            SQLPrepareA(stmt_cutoff, (SQLCHAR*)q.c_str(), SQL_NTS);
            
            SQLINTEGER y = year, st = row.stage, rk = row.rank;
            SQLDOUBLE perc = row.percentile;
            SQLINTEGER colCode = (row.col_code != 0) ? row.col_code : global_col_code;
            long long brCode = (row.br_code != 0) ? row.br_code : global_br_code;
            std::string cat = row.category;
            
            SQLLEN cbNum = 0, cbCat = SQL_NTS;
            
            SQLBindParameter(stmt_cutoff, 1, SQL_PARAM_INPUT, SQL_C_LONG, SQL_INTEGER, 0, 0, &y, 0, &cbNum);
            SQLBindParameter(stmt_cutoff, 2, SQL_PARAM_INPUT, SQL_C_LONG, SQL_INTEGER, 0, 0, &st, 0, &cbNum);
            SQLBindParameter(stmt_cutoff, 3, SQL_PARAM_INPUT, SQL_C_LONG, SQL_INTEGER, 0, 0, &colCode, 0, &cbNum);
            SQLBindParameter(stmt_cutoff, 4, SQL_PARAM_INPUT, SQL_C_SBIGINT, SQL_BIGINT, 0, 0, &brCode, 0, &cbNum);
            SQLBindParameter(stmt_cutoff, 5, SQL_PARAM_INPUT, SQL_C_CHAR, SQL_VARCHAR, cat.length(), 0, (SQLPOINTER)cat.c_str(), cat.length(), &cbCat);
            SQLBindParameter(stmt_cutoff, 6, SQL_PARAM_INPUT, SQL_C_LONG, SQL_INTEGER, 0, 0, &rk, 0, &cbNum);
            SQLBindParameter(stmt_cutoff, 7, SQL_PARAM_INPUT, SQL_C_DOUBLE, SQL_FLOAT, 0, 0, &perc, 0, &cbNum);
            
            SQLRETURN ret = SQLExecute(stmt_cutoff);
            if (SQL_SUCCEEDED(ret)) {
                total_inserted++;
            } else {
                if (total_inserted == 0) { // Only print the very first error so we don't flood the console
                    extract_error("SQLExecute(stmt_cutoff)", stmt_cutoff, SQL_HANDLE_STMT);
                }
            }
            SQLFreeStmt(stmt_cutoff, SQL_RESET_PARAMS);
        }

        if (pd.final_col_code != 0) global_col_code = pd.final_col_code;
        if (pd.final_br_code != 0) global_br_code = pd.final_br_code;
        
        SQLEndTran(SQL_HANDLE_DBC, dbc, SQL_COMMIT);
    }

    std::cout << "Total rows inserted: " << total_inserted << std::endl;

    SQLFreeHandle(SQL_HANDLE_STMT, stmt_col);
    SQLFreeHandle(SQL_HANDLE_STMT, stmt_br);
    SQLFreeHandle(SQL_HANDLE_STMT, stmt_cutoff);
    SQLDisconnect(dbc);
    SQLFreeHandle(SQL_HANDLE_DBC, dbc);
    SQLFreeHandle(SQL_HANDLE_ENV, env);
}

std::string open_file_dialog() {
    OPENFILENAMEA ofn;
    char szFile[260] = {0};
    ZeroMemory(&ofn, sizeof(ofn));
    ofn.lStructSize = sizeof(ofn);
    ofn.hwndOwner = NULL;
    ofn.lpstrFile = szFile;
    ofn.nMaxFile = sizeof(szFile);
    ofn.lpstrFilter = "PDF Files\0*.pdf\0All Files\0*.*\0";
    ofn.nFilterIndex = 1;
    ofn.lpstrFileTitle = NULL;
    ofn.nMaxFileTitle = 0;
    ofn.lpstrInitialDir = NULL;
    ofn.Flags = OFN_PATHMUSTEXIST | OFN_FILEMUSTEXIST;

    if (GetOpenFileNameA(&ofn) == TRUE) {
        return szFile;
    }
    return "";
}

int main(int argc, char* argv[])
{
    std::cout << "Starting C++ Parallel PDF Extractor..." << std::endl;
    
    std::string pdf_path = "";
    if (argc > 1) {
        pdf_path = argv[1];
    } else {
        pdf_path = open_file_dialog();
    }
    if (pdf_path.empty()) {
        std::cout << "No file selected. Exiting." << std::endl;
        return 0;
    }
    std::cout << "Selected PDF: " << pdf_path << std::endl;
    
    std::string poppler_dir = find_poppler_dir();
    std::cout << "Using Poppler tools from: " << poppler_dir << std::endl;
    
    int year = 2024;
    int total_pages = get_total_pages(pdf_path, poppler_dir);
    std::cout << "Detected " << total_pages << " pages in PDF." << std::endl;
    
    std::vector<std::future<PageData>> futures;
    
    int num_threads = std::thread::hardware_concurrency();
    std::cout << "Using " << num_threads << " concurrent threads." << std::endl;

    // Spin up parallel tasks
    for (int p = 1; p <= total_pages; ++p) {
        futures.push_back(std::async(std::launch::async, process_page, pdf_path, p, poppler_dir));
    }

    std::vector<PageData> all_pages;
    for (auto& fut : futures) {
        all_pages.push_back(fut.get());
        std::cout << "\rProcessed page " << all_pages.size() << "/" << total_pages;
    }
    std::cout << "\nExtraction finished. Connecting to DB..." << std::endl;

    insert_results_odbc(all_pages, year);

    return 0;
}
