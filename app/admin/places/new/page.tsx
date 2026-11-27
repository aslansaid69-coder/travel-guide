import { requirePage } from "@/lib/auth/session";
import { configuredProviders, defaultProvider } from "@/lib/places/providers";
import { PageHeader } from "@/components/admin/ui";
import { PlaceImport } from "@/components/admin/place-import";

export const metadata = { title: "Add place" };

export default async function NewPlace() {
  await requirePage("places.import", "/admin/places/new");
  const providers = configuredProviders().map((p) => ({ id: p.id, label: p.label, policy: p.policy }));
  return (
    <>
      <PageHeader
        title="Add a place"
        intro="Search a source, import the right result and we fill in coordinates, photos and details. You then review, generate a description and publish."
      />
      <PlaceImport providers={providers} initial={defaultProvider().id} />
    </>
  );
}
