// UCA-3 Host data service, reference skeleton.
// Runs next to a validator that hosts external parties. Holds no keys.
// Reads from the validator's own Ledger API (JSON API v2) and serves a party's
// contracts, with created-event blobs, only to requests signed by that party.
import express, { Request, Response, NextFunction } from "express";
import { makeVerifier } from "./uca3-auth";

type LedgerClient = {
  get(path: string): Promise<any>;
  post(path: string, body: unknown): Promise<any>;
};

const HOLDING_INTERFACE = "#splice-api-token-holding-v1:Splice.Api.Token.HoldingV1:Holding";
const TRANSFER_INSTRUCTION_INTERFACE = "#splice-api-token-transfer-instruction-v1:Splice.Api.Token.TransferInstructionV1:TransferInstruction";

export function ucaHostRouter(deps: {
  ledger: LedgerClient;
  publicKeyOf: (party: string) => Promise<string | null>; // from the host's topology state
  hostedParties: () => Promise<Set<string>>; // external parties hosted here that did not opt out
  rateLimit: (party: string) => boolean; // same limit for every caller
  meta: { participantId: string; rewardParty: string; baseUrl: string };
}) {
  const r = express.Router();
  const verify = makeVerifier(deps.publicKeyOf);

  r.use(express.text({ type: "*/*", limit: "256kb" }));

  // Public metadata: published so UCA-2 discovery can return it.
  r.get("/meta", (_req, res) => res.json(deps.meta));

  async function auth(req: Request, res: Response, next: NextFunction) {
    const body = typeof req.body === "string" ? req.body : "";
    const v = await verify(req.headers as Record<string, string>, req.method, req.baseUrl + req.path, body);
    if (!v.ok) return res.status(401).json({ error: v.reason });
    if (v.party !== req.params.party) return res.status(403).json({ error: "party_mismatch" });
    if (!(await deps.hostedParties()).has(v.party)) return res.status(404).json({ error: "not_hosted" });
    if (!deps.rateLimit(v.party)) return res.status(429).json({ error: "rate_limited" });
    next();
  }

  async function activeAt(party: string, cumulative: unknown[]) {
    const end = await deps.ledger.get("/v2/state/ledger-end");
    return deps.ledger.post("/v2/state/active-contracts", {
      eventFormat: { filtersByParty: { [party]: { cumulative } }, verbose: false },
      activeAtOffset: Number(end.offset),
    });
  }

  const byInterface = (interfaceId: string) => ({
    identifierFilter: { InterfaceFilter: { value: { interfaceId, includeInterfaceView: true, includeCreatedEventBlob: true } } },
  });
  const byTemplate = (templateId: string) => ({
    identifierFilter: { TemplateFilter: { value: { templateId, includeCreatedEventBlob: true } } },
  });

  r.get("/parties/:party/holdings", auth, async (req, res) => {
    res.json(await activeAt(req.params.party, [byInterface(HOLDING_INTERFACE)]));
  });

  r.post("/parties/:party/contracts", auth, async (req, res) => {
    const q = JSON.parse(String(req.body || "{}")) as { templateIds?: string[]; interfaceIds?: string[] };
    const filters = [...(q.templateIds ?? []).map(byTemplate), ...(q.interfaceIds ?? []).map(byInterface)];
    if (!filters.length) return res.status(400).json({ error: "filter_required" });
    res.json(await activeAt(req.params.party, filters));
  });

  r.get("/parties/:party/pending", auth, async (req, res) => {
    res.json(await activeAt(req.params.party, [byInterface(TRANSFER_INSTRUCTION_INTERFACE)]));
  });

  r.get("/packages", async (_req, res) => {
    res.json(await deps.ledger.get("/v2/packages"));
  });

  // Optional: prepare and execute for wallets without their own node.
  r.post("/parties/:party/prepare", auth, async (req, res) => {
    const body = JSON.parse(String(req.body || "{}"));
    res.json(await deps.ledger.post("/v2/interactive-submission/prepare", { ...body, actAs: [req.params.party] }));
  });

  r.post("/parties/:party/execute", auth, async (req, res) => {
    res.json(await deps.ledger.post("/v2/interactive-submission/execute", JSON.parse(String(req.body || "{}"))));
  });

  return r;
}

// Mount: app.use("/uca/v1", ucaHostRouter({...}))
