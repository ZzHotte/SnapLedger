import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import StoragePage from "./storage/page";
import TransportPage from "./transport/page";
import CarrierTracking from "./market-data/carrier-tracking";

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: { id: 1, name: "Zoe", email: "z@example.com" }, loading: false }),
}));
vi.mock("@/lib/workspace-context", () => ({
  useWorkspace: () => ({ currentWorkspace: { id: 1, name: "WS", role: "owner" } }),
}));

describe("Storage page", () => {
  it("switches between inventory, inbound, outbound and packing lists", () => {
    render(<StoragePage />);
    expect(screen.getByText("PRT-SOFA-3S-GRY")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Inbound" }));
    expect(screen.getByText("ASN-24-0381")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Outbound" }));
    expect(screen.getByText("SO-24-1180")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Packing lists" }));
    expect(screen.getByText("PL-MSKU7342110")).toBeInTheDocument();
  });
});

describe("Transport page", () => {
  it("hides delivered trips under Active and shows them under All", () => {
    render(<TransportPage />);
    expect(screen.queryByText("Sofia Martins")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "All" }));
    expect(screen.getAllByText("Sofia Martins").length).toBeGreaterThan(0);
  });
});

describe("Carrier tracking", () => {
  it("auto-detects the carrier and renders a timeline", () => {
    render(<CarrierTracking />);
    fireEvent.change(screen.getByLabelText(/Track a container/), { target: { value: "MSKU7342110" } });
    fireEvent.click(screen.getByRole("button", { name: "Track" }));
    expect(screen.getByText("Loaded on vessel")).toBeInTheDocument();
    expect(screen.getByText(/Maersk · Container/)).toBeInTheDocument();
  });

  it("asks for a carrier when the prefix is unknown", () => {
    render(<CarrierTracking />);
    fireEvent.change(screen.getByLabelText(/Track a container/), { target: { value: "254819034" } });
    fireEvent.click(screen.getByRole("button", { name: "Track" }));
    expect(screen.getByText(/pick one from the list/)).toBeInTheDocument();
  });
});
