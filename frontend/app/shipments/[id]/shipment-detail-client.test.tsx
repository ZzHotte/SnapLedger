import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ShipmentDetailClient from "./shipment-detail-client";
import type { ShipmentDetail } from "@/lib/api";

const { useWorkspaceMock, fetchShipmentMock, deleteShipmentMock, pushMock } = vi.hoisted(() => ({
  useWorkspaceMock: vi.fn(),
  fetchShipmentMock: vi.fn(),
  deleteShipmentMock: vi.fn(),
  pushMock: vi.fn(),
}));

vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: { id: 1 }, loading: false }) }));
vi.mock("@/lib/workspace-context", () => ({ useWorkspace: useWorkspaceMock }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: pushMock }) }));
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    fetchShipment: fetchShipmentMock,
    fetchCarriers: vi.fn().mockResolvedValue([]),
    deleteShipment: deleteShipmentMock,
  };
});

const SHIPMENT: ShipmentDetail = {
  id: 7,
  customer_name: "Pacific Rim Trading Co.",
  carrier_name: "Maersk",
  freight_mode: "FCL",
  origin_port: "Qingdao, CN",
  destination_port: "Melbourne, AU",
  cargo_description: "Furniture",
  container_no: "MSKU7342110",
  weight_kg: 9840,
  freight_cost: 4424.22,
  currency: "USD",
  status: "in_transit",
  shipment_date: "2026-10-01",
  etd: "2026-10-10",
  eta: "2026-11-08",
  document_file_url: null,
  created_at: "2026-10-01T00:00:00Z",
  quotes: [],
  tracking_events: [],
};

beforeEach(() => {
  useWorkspaceMock.mockReturnValue({ currentWorkspace: { id: 1, name: "WS", role: "owner" } });
  fetchShipmentMock.mockResolvedValue(SHIPMENT);
  deleteShipmentMock.mockReset().mockResolvedValue(undefined);
  pushMock.mockReset();
});

describe("ShipmentDetailClient", () => {
  it("leads with the customer and shows the schedule with transit days", async () => {
    render(<ShipmentDetailClient shipmentId={7} />);
    expect(await screen.findByRole("heading", { name: "Pacific Rim Trading Co." })).toBeInTheDocument();
    expect(screen.getByText("2026-10-10")).toBeInTheDocument();
    expect(screen.getByText("29 days")).toBeInTheDocument();
    expect(screen.getByRole("listitem", { current: "step" })).toHaveTextContent("in transit");
  });

  it("deletes from the More menu after confirmation and returns to the list", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<ShipmentDetailClient shipmentId={7} />);
    fireEvent.click(await screen.findByRole("button", { name: "More" }));
    fireEvent.click(screen.getByText("Delete shipment"));

    await waitFor(() => expect(deleteShipmentMock).toHaveBeenCalledWith(7, 1));
    expect(pushMock).toHaveBeenCalledWith("/dashboard");
    confirmSpy.mockRestore();
  });

  it("hides delete for viewers", async () => {
    useWorkspaceMock.mockReturnValue({ currentWorkspace: { id: 1, name: "WS", role: "viewer" } });
    render(<ShipmentDetailClient shipmentId={7} />);
    await screen.findByRole("heading", { name: "Pacific Rim Trading Co." });
    expect(screen.queryByRole("button", { name: "More" })).not.toBeInTheDocument();
  });
});
