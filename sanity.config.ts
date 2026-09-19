import { defineConfig } from "sanity";
import { structureTool } from "sanity/structure";
import { visionTool } from "@sanity/vision";
import { presentationTool } from "sanity/presentation";
import { apiVersion, dataset, projectId } from "@/sanity/env";
import { schemaTypes } from "@/sanity/schemaTypes";

// Desk structure lists exactly one item per singleton document rather than
// the default document-type list — there is only ever one Homepage Hero
// document, so an editor should never see a generic "create new" list for
// it.
const singletonTypes = new Set(["homepageHero"]);

export default defineConfig({
  name: "youmimic",
  title: "YouMimic Content",

  // Mounted at /admin/studio (app/admin/studio/[[...tool]]/page.tsx), which
  // does its own adminRole check — see that file's comment for why it isn't
  // nested under app/(admin) instead (Studio needs the full viewport, not
  // the admin dashboard's sidebar shell).
  basePath: "/admin/studio",

  projectId,
  dataset,

  plugins: [
    structureTool({
      structure: (S) =>
        S.list()
          .title("Content")
          .items([
            S.listItem()
              .title("Homepage Hero")
              .id("homepageHero")
              .child(S.document().schemaType("homepageHero").documentId("homepageHero")),
          ]),
    }),
    presentationTool({
      previewUrl: {
        previewMode: {
          enable: "/api/draft-mode/enable",
        },
      },
    }),
    visionTool({ defaultApiVersion: apiVersion }),
  ],

  schema: {
    types: schemaTypes,
    // Blocks the generic "create new document" action for singletons —
    // there must only ever be the one document per type above.
    templates: (templates) =>
      templates.filter(({ schemaType }) => !singletonTypes.has(schemaType)),
  },
});
