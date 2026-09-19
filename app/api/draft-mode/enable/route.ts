import { defineEnableDraftMode } from "next-sanity/draft-mode";
import { client } from "@/sanity/lib/client";

// Called only by the Studio's Presentation tool (sanity.config.ts's
// previewUrl.previewMode.enable) when an editor opens the live preview
// pane — never linked to from anywhere a regular visitor could reach.
// Validates a signed secret against this exact Sanity project before
// turning draft mode on, so this route can't be used to preview drafts
// without already having Studio access.
export const { GET } = defineEnableDraftMode({
  client: client.withConfig({ token: process.env.SANITY_API_READ_TOKEN }),
});
