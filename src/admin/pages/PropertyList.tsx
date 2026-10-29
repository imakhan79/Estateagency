import { useNavigate, useSearchParams } from "react-router-dom";
import { Plus } from "lucide-react";
import { useAuth } from "../auth";
import { date, money, nameOf, q, supabase, useLoad, useLookups, type Row } from "../lib";
import { Badge, Card, ErrorBox, Input, LinkButton, PageHeader, Select, Table } from "../ui";

export default function PropertyList() {
  const { can } = useAuth();
  const l = useLookups();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const get = (k: string) => params.get(k) ?? "";
  const set = (k: string, v: string) => {
    const n = new URLSearchParams(params);
    if (v) n.set(k, v); else n.delete(k);
    setParams(n, { replace: true });
  };

  const { data, error } = useLoad(async () => {
    let query = supabase.from("properties")
      .select("id, ref, slug, title, listing_type, price, currency, city, area, availability, publication, featured, type_id, agent_id, updated_at")
      .order("updated_at", { ascending: false }).limit(500);
    if (get("listing")) query = query.eq("listing_type", get("listing"));
    if (get("availability")) query = query.eq("availability", get("availability"));
    if (get("publication")) query = query.eq("publication", get("publication"));
    else query = query.neq("publication", "archived");
    if (get("city")) query = query.ilike("city", `%${get("city")}%`);
    if (get("q")) {
      const t = get("q").replace(/[%,()]/g, " ");
      query = query.or(`title.ilike.%${t}%,ref.ilike.%${t}%,area.ilike.%${t}%`);
    }
    return q<Row[]>(query);
  }, [params.toString()]);

  return (
    <>
      <PageHeader
        title="Properties"
        subtitle="Archived properties are hidden unless you filter for them."
        actions={can("properties.edit") && <LinkButton to="/admin/properties/new" variant="primary"><Plus size={16} /> Add property</LinkButton>}
      />
      <Card>
        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Input placeholder="Search title, ref, area" defaultValue={get("q")} onKeyDown={(e) => e.key === "Enter" && set("q", e.currentTarget.value)} onBlur={(e) => set("q", e.target.value)} />
          <Input placeholder="City" defaultValue={get("city")} onBlur={(e) => set("city", e.target.value)} />
          <Select value={get("listing")} onChange={(e) => set("listing", e.target.value)}>
            <option value="">Sale and rent</option><option value="sale">For sale</option><option value="rent">For rent</option>
          </Select>
          <Select value={get("availability")} onChange={(e) => set("availability", e.target.value)}>
            <option value="">Any availability</option>
            {l?.availability.map((a) => <option key={a.slug} value={a.slug}>{a.name}</option>)}
          </Select>
          <Select value={get("publication")} onChange={(e) => set("publication", e.target.value)}>
            <option value="">Active (not archived)</option>
            {["draft", "under_review", "approved", "published", "unpublished", "archived"].map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
          </Select>
        </div>
        <ErrorBox error={error} />
        <Table rows={data} onRowClick={(r) => navigate(`/admin/properties/${r.id}`)} empty="No properties match these filters." columns={[
          { key: "ref", header: "Ref", className: "whitespace-nowrap text-stone-500" },
          { key: "title", header: "Property", render: (r) => <><span className="font-medium text-stone-900">{r.title}</span>{r.featured && <span className="ml-2"><Badge tone="purple">Featured</Badge></span>}<span className="block text-xs text-stone-500">{nameOf(l?.types, r.type_id)} · {r.area}, {r.city}</span></> },
          { key: "price", header: "Price", className: "whitespace-nowrap", render: (r) => <>{money(r.price, r.currency)}{r.listing_type === "rent" && <span className="text-xs text-stone-500"> /mo</span>}</> },
          { key: "availability", header: "Availability", render: (r) => <Badge status={r.availability} /> },
          { key: "publication", header: "Website", render: (r) => <Badge status={r.publication} /> },
          { key: "agent_id", header: "Agent", render: (r) => <span className="text-stone-600">{nameOf(l?.staff, r.agent_id, "id", "full_name")}</span> },
          { key: "updated_at", header: "Updated", className: "whitespace-nowrap text-stone-500", render: (r) => date(r.updated_at) },
        ]} />
      </Card>
    </>
  );
}
