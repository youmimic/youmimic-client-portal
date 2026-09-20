import { defineField, defineType } from "sanity";

// "Trusted by [Our Clients]" section — heading/subheading plus the actual
// testimonial cards, kept on one document rather than splitting the list
// into its own document type. No image per testimonial (the card just
// shows a generic icon), so unlike homepageIntro's photo, these fields can
// safely follow the normal pre-filled-default pattern with no "misleading
// fallback" concern. Same prefix/accent heading split as the other
// homepage section intros.
export const homepageTestimonialsIntro = defineType({
  name: "homepageTestimonialsIntro",
  title: "Homepage: Testimonials Intro",
  type: "document",
  fields: [
    defineField({
      name: "headingPrefix",
      title: "Heading (plain part)",
      type: "string",
      description: 'E.g. "Trusted by"',
      initialValue: "Trusted by",
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "headingAccent",
      title: "Heading (accent part)",
      type: "string",
      description: 'E.g. "Our Clients" — rendered in the brand teal color',
      initialValue: "Our Clients",
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "subheading",
      title: "Subheading",
      type: "text",
      rows: 2,
      initialValue: "Real feedback from the teams already using their digital twins.",
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "items",
      title: "Testimonials",
      type: "array",
      of: [
        {
          type: "object",
          name: "testimonial",
          fields: [
            defineField({ name: "quote", title: "Quote", type: "text", rows: 3, validation: (rule) => rule.required() }),
            defineField({ name: "name", title: "Name", type: "string", validation: (rule) => rule.required() }),
            defineField({ name: "role", title: "Role", type: "string", validation: (rule) => rule.required() }),
            defineField({ name: "company", title: "Company", type: "string", validation: (rule) => rule.required() }),
          ],
          preview: {
            select: { title: "name", subtitle: "company" },
          },
        },
      ],
      validation: (rule) => rule.required().min(1),
      initialValue: [
        {
          _type: "testimonial",
          _key: "patrick-lang",
          quote:
            "You Mimic AI are amazing! From capture session to onboarding and support. The quality of my avatar is mind blowing!",
          name: "Patrick Lang",
          role: "Realtor",
          company: "Belle Property Australia",
        },
        {
          _type: "testimonial",
          _key: "joel-starkey",
          quote:
            "You Mimic AI is a truly forward-thinking partner for us. Hyper-realistic avatars that power our Sales Kick-offs, Town Halls and Customer Presentations. It saves us time.",
          name: "Joel Starkey",
          role: "Sales Enablement",
          company: "DXC Technology",
        },
        {
          _type: "testimonial",
          _key: "catherine-ball",
          quote:
            "You Mimic AI are the gold standard in avatar captures and set the benchmark for quality, ethics and responsible AI.",
          name: "Dr. Catherine Ball",
          role: "Corporate Speaker",
          company: "Xprize Board Member",
        },
      ],
    }),
    defineField({
      name: "logos",
      title: "Client Logos",
      description:
        "The 2×5 client-logo grid below the testimonials. No fallback if this is left empty (same reasoning as the Digital Twin Intro's image) — the grid simply won't render rather than silently keep showing old logos Studio can't reflect.",
      type: "array",
      of: [
        {
          type: "object",
          name: "clientLogo",
          fields: [
            defineField({
              name: "name",
              title: "Client name",
              type: "string",
              description: "Used as the image's alt text.",
              validation: (rule) => rule.required(),
            }),
            defineField({
              name: "logo",
              title: "Logo",
              type: "image",
              validation: (rule) => rule.required(),
            }),
          ],
          preview: {
            select: { title: "name", media: "logo" },
          },
        },
      ],
    }),
  ],
  preview: {
    select: { title: "headingAccent" },
  },
});
