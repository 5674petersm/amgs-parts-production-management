"use client";

import { useCallback, useState } from "react";

import { InventoryStatusTable } from "@/components/InventoryStatusTable";
import { StationBarChart } from "@/components/StationBarChart";
import type { DashboardStats, StockInventoryRow } from "@/types/dashboard";

type DashboardTab = "production" | "inventory";

type DashboardViewProps = {
  initialStats: DashboardStats;
  initialInventoryRows: StockInventoryRow[];
  defaultStartDate: string;
  defaultEndDate: string;
};

export function DashboardView({
  initialStats,
  initialInventoryRows,
  defaultStartDate,
  defaultEndDate,
}: DashboardViewProps) {
  const [activeTab, setActiveTab] = useState<DashboardTab>("production");
  const [startDate, setStartDate] = useState(defaultStartDate);
  const [endDate, setEndDate] = useState(defaultEndDate);
  const [stats, setStats] = useState(initialStats);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async (start: string, end: string) => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({ start, end });
      const response = await fetch(`/api/dashboard?${params.toString()}`);
      const data = (await response.json()) as DashboardStats & { error?: string };

      if (!response.ok) {
        setError(data.error ?? "Unable to load dashboard data.");
        return;
      }

      setStats(data);
    } catch {
      setError("Could not reach the server. Check your connection.");
    } finally {
      setLoading(false);
    }
  }, []);

  const applyRange = useCallback(async () => {
    await fetchStats(startDate, endDate);
  }, [fetchStats, startDate, endDate]);

  const resetToCurrentWeek = useCallback(async () => {
    setStartDate(defaultStartDate);
    setEndDate(defaultEndDate);
    await fetchStats(defaultStartDate, defaultEndDate);
  }, [defaultStartDate, defaultEndDate, fetchStats]);

  return (
    <section>
      <h1 className="dashboard-title">Dashboard</h1>

      <div
        className="dashboard-tabs"
        role="tablist"
        aria-label="Dashboard sections"
      >
        <button
          type="button"
          role="tab"
          id="dashboard-tab-production"
          className={`dashboard-tab${activeTab === "production" ? " active" : ""}`}
          aria-selected={activeTab === "production"}
          aria-controls="dashboard-panel-production"
          onClick={() => setActiveTab("production")}
        >
          Production
        </button>
        <button
          type="button"
          role="tab"
          id="dashboard-tab-inventory"
          className={`dashboard-tab${activeTab === "inventory" ? " active" : ""}`}
          aria-selected={activeTab === "inventory"}
          aria-controls="dashboard-panel-inventory"
          onClick={() => setActiveTab("inventory")}
        >
          Inventory
        </button>
      </div>

      {activeTab === "production" && (
        <div
          role="tabpanel"
          id="dashboard-panel-production"
          aria-labelledby="dashboard-tab-production"
        >
          <p className="hint">
            Dates use plant-local time ({stats.startDate} through {stats.endDate}
            ).
          </p>

          <form
            className="card dashboard-filter"
            onSubmit={(event) => {
              event.preventDefault();
              void applyRange();
            }}
          >
            <div className="dashboard-filter-fields">
              <label>
                Start date
                <input
                  type="date"
                  value={startDate}
                  onChange={(event) => setStartDate(event.target.value)}
                  required
                />
              </label>
              <label>
                End date
                <input
                  type="date"
                  value={endDate}
                  onChange={(event) => setEndDate(event.target.value)}
                  required
                />
              </label>
            </div>
            <div className="dashboard-filter-actions">
              <button type="submit" className="primary-button" disabled={loading}>
                {loading ? "Loading…" : "Apply range"}
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={() => void resetToCurrentWeek()}
                disabled={loading}
              >
                Current week
              </button>
            </div>
          </form>

          {error && <p className="error">{error}</p>}

          <div className="dashboard-panels">
            <StationBarChart
              rows={stats.produced}
              title="Produced by station"
              description="Total pieces logged at each station, including work-in-progress."
            />
            <StationBarChart
              rows={stats.completed}
              title="Completed by station"
              description="Total pieces finished at each station (final-station stock and custom parts marked complete)."
            />
          </div>
        </div>
      )}

      {activeTab === "inventory" && (
        <div
          role="tabpanel"
          id="dashboard-panel-inventory"
          aria-labelledby="dashboard-tab-inventory"
        >
          <InventoryStatusTable initialRows={initialInventoryRows} />
        </div>
      )}
    </section>
  );
}
