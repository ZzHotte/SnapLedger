"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import {
  ApiError,
  fetchBankRates,
  fetchExchangeRate,
  fetchMacroIndicator,
  type BankRate,
  type ExchangeRate,
  type MacroIndicator,
} from "@/lib/api";
import { CURRENCIES, MARKET_DATA_COUNTRIES as COUNTRIES } from "@/lib/constants";

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString();
}

function CurrencyConverter() {
  const [amount, setAmount] = useState("100");
  const [base, setBase] = useState("CNY");
  const [target, setTarget] = useState("AUD");
  const [rate, setRate] = useState<ExchangeRate | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchExchangeRate(base, target);
        if (!cancelled) setRate(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Failed to load exchange rate");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [base, target]);

  const amountNum = parseFloat(amount);
  const converted = rate && !Number.isNaN(amountNum) ? amountNum * rate.rate : null;

  return (
    <section>
      <h2 className="mb-3 text-sm font-medium text-gray-700">Exchange rate</h2>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-28 rounded-md border border-gray-300 px-2 py-1.5 text-sm"
        />
        <select
          value={base}
          onChange={(e) => setBase(e.target.value)}
          className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
        >
          {CURRENCIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <button
          onClick={() => {
            setBase(target);
            setTarget(base);
          }}
          className="rounded-md border border-gray-300 px-2 py-1.5 text-sm hover:bg-gray-50"
          aria-label="Swap currencies"
        >
          ⇄
        </button>
        <select
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
        >
          {CURRENCIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-3">
        {error && <p className="text-sm text-red-600">{error}</p>}
        {loading && <p className="text-sm text-gray-500">Loading…</p>}
        {converted !== null && !loading && !error && (
          <>
            <p className="text-2xl font-semibold">
              {converted.toLocaleString(undefined, { maximumFractionDigits: 2 })} {target}
            </p>
            <p className="text-xs text-gray-500">
              1 {base} = {rate!.rate} {target} · updated {formatTime(rate!.fetched_at)}
            </p>
          </>
        )}
      </div>
    </section>
  );
}

function BankRatesTable() {
  const [country, setCountry] = useState("CHN");
  const [rates, setRates] = useState<BankRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchBankRates(country);
        if (!cancelled) setRates(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Failed to load bank rates");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [country]);

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-medium text-gray-700">Bank deposit rates</h2>
        <select
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
        >
          {COUNTRIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {loading && <p className="text-sm text-gray-500">Loading…</p>}
      {!loading && !error && rates.length === 0 && <p className="text-sm text-gray-500">No data for this country yet.</p>}
      {!loading && !error && rates.length > 0 && (
        <div className="space-y-2">
          {rates.map((r, i) => (
            <div key={i} className="flex items-center justify-between text-sm">
              <span className="text-gray-700">
                {r.bank_name} · {r.product_type === "demand" ? "Demand deposit" : `${r.term_months}-month term`}
              </span>
              <span className="font-medium">{r.rate}%</span>
            </div>
          ))}
        </div>
      )}
      <p className="mt-3 text-xs text-gray-400">
        Manually curated reference figures, not a live feed — actual rates may have moved since last updated.
      </p>
    </section>
  );
}

function MacroIndicators() {
  const [country, setCountry] = useState("CHN");
  const [gdp, setGdp] = useState<MacroIndicator | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchMacroIndicator(country, "gdp_per_capita");
        if (!cancelled) setGdp(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Failed to load GDP data");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [country]);

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-medium text-gray-700">Macro indicators</h2>
        <select
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
        >
          {COUNTRIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {loading && <p className="text-sm text-gray-500">Loading…</p>}
      {gdp && !loading && !error && (
        <div className="rounded-md border border-gray-200 p-4">
          <p className="text-xs text-gray-500">GDP per capita ({gdp.year})</p>
          <p className="text-xl font-semibold">${gdp.value.toLocaleString()}</p>
          <p className="text-xs text-gray-400">Source: World Bank</p>
        </div>
      )}
      <p className="mt-3 text-xs text-gray-400">
        Average wage isn&apos;t shown yet — there&apos;s no free, comparable data source across countries.
      </p>
    </section>
  );
}

export default function MarketDataPage() {
  const { user, loading: authLoading } = useAuth();

  if (authLoading || !user) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <p className="text-sm text-gray-500">Loading…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 p-6">
      <div>
        <h1 className="text-xl font-semibold">Market Data</h1>
        <p className="text-sm text-gray-500">Reference info only — not investment advice.</p>
      </div>

      <CurrencyConverter />
      <BankRatesTable />
      <MacroIndicators />
    </main>
  );
}
