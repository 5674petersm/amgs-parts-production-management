import type { StockItem } from "@/types";

type PartSearchResultsProps = {
  matches: StockItem[];
  onSelect: (item: StockItem) => void;
  onBack: () => void;
};

export function PartSearchResults({
  matches,
  onSelect,
  onBack,
}: PartSearchResultsProps) {
  return (
    <section>
      <div className="card">
        <h2>Select a part</h2>
        <p className="notice">
          {matches.length} matching part{matches.length === 1 ? "" : "s"} found.
          Tap the one you want.
        </p>
        <ul className="part-search-results">
          {matches.map((match) => (
            <li key={match.itemId}>
              <button
                type="button"
                className="part-search-result"
                onClick={() => onSelect(match)}
              >
                <span className="part-search-result-number">
                  {match.masterPNo}
                </span>
                <span className="part-search-result-description">
                  {match.itemDescription || "No description"}
                </span>
                <span className="part-search-result-meta">
                  Item ID {match.itemId}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
      <p className="hint" style={{ marginTop: "1rem" }}>
        <button type="button" className="link-button" onClick={onBack}>
          Search again
        </button>
      </p>
    </section>
  );
}
