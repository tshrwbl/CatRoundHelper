export function Pagination({ page, pageSize, total, onPage, onPageSize }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const visible = (() => {
    if (pages <= 7) {
      return Array.from({ length: pages }, (_, index) => index + 1);
    }
    if (page <= 4) {
      return [1, 2, 3, 4, 5, 6, pages];
    }
    if (page >= pages - 3) {
      return [1, pages - 5, pages - 4, pages - 3, pages - 2, pages - 1, pages];
    }
    return [1, page - 2, page - 1, page, page + 1, page + 2, pages];
  })();
  return (
    <footer className="pagination">
      <span>
        Showing {total ? (page - 1) * pageSize + 1 : 0}–{Math.min(page * pageSize, total)} of {total} results
      </span>
      <label>
        Rows per page
        <select value={pageSize} onChange={(event) => onPageSize(Number(event.target.value))}>
          {[10, 25, 50, 100].map((size) => (
            <option key={size}>{size}</option>
          ))}
        </select>
      </label>
      <div className="page-buttons">
        <button disabled={page === 1} onClick={() => onPage(page - 1)}>
          Previous
        </button>
        {visible.map((number) => (
          <button key={number} className={number === page ? "current" : ""} onClick={() => onPage(number)}>
            {number}
          </button>
        ))}
        <button disabled={page === pages} onClick={() => onPage(page + 1)}>
          Next
        </button>
      </div>
    </footer>
  );
}
