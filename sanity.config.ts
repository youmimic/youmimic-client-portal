import { defineConfig } from "sanity";
import { structureTool } from "sanity/structure";
import { visionTool } from "@sanity/vision";
import { presentationTool } from "sanity/presentation";
import { apiVersion, dataset, projectId } from "@/sanity/env";
import { schemaTypes } from "@/sanity/schemaTypes";

// Desk structure lists exactly one item per singleton document rather than
// the default document-type list — there is only ever one of each of these
// per site, so an editor should never see a generic "create new" list for
// any of them.
const singletonTypes = new Set([
  "homepageHero",
  "homepageIntro",
  "homepageHowItWorks",
  "homepageHowItLooks",
  "homepageTestimonialsIntro",
  "homepageServices",
  "homepageFeaturedAt",
]);

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
            S.listItem()
              .title("Homepage: Digital Twin Intro")
              .id("homepageIntro")
              .child(S.document().schemaType("homepageIntro").documentId("homepageIntro")),
            S.listItem()
              .title("Homepage: How It Works")
              .id("homepageHowItWorks")
              .child(
                S.document().schemaType("homepageHowItWorks").documentId("homepageHowItWorks"),
              ),
            S.listItem()
              .title("Homepage: How It Looks")
              .id("homepageHowItLooks")
              .child(
                S.document().schemaType("homepageHowItLooks").documentId("homepageHowItLooks"),
              ),
            S.listItem()
              .title("Homepage: Testimonials Intro")
              .id("homepageTestimonialsIntro")
              .child(
                S.document()
                  .schemaType("homepageTestimonialsIntro")
                  .documentId("homepageTestimonialsIntro"),
              ),
            S.listItem()
              .title("Homepage: Services")
              .id("homepageServices")
              .child(S.document().schemaType("homepageServices").documentId("homepageServices")),
            S.listItem()
              .title("Homepage: Featured At")
              .id("homepageFeaturedAt")
              .child(
                S.document().schemaType("homepageFeaturedAt").documentId("homepageFeaturedAt"),
              ),
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
