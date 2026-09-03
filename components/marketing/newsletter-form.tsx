// Brevo ("Sendinblue") newsletter signup form. Restyled to match this
// site's own typography/palette instead of Brevo's default embed CSS
// (Helvetica/Roboto, its own colors) — Brevo's own stylesheet
// (sibforms.com/forms/end-form/build/sib-styles.css) and font-face block
// are deliberately not loaded here, since they'd fight the site's
// Montserrat/brand tokens. The functional bits (form action, field names,
// hidden fields) are unchanged from Brevo's generated embed — those are
// what Brevo's backend actually reads, so they can't be renamed or
// restructured. Plain native form POST, no client JS needed.
export function NewsletterForm() {
  return (
    <form
      id="sib-form"
      method="POST"
      action="https://b7f71b9c.sibforms.com/serve/MUIFAOTXsoAl4QcS6Jjrh6QeCA7xcVMwe7qonH8o7uLP67Gq-qZ6G2LjCXXEJ9LC8-ljKAdTWe0kqzmhawbD2y8m5T5d_s-bvXkUAnJpjFvxbU_QUqwGPtn_aYlnBPAwkreQherlQ7et0F1NUgjnHgu4KPYCLzqOHfbtKGETHhNlRdTnJ7UJdnTyOJuq9R1kdMHHMrdrkUlI5uYkgw=="
    >
      <label htmlFor="EMAIL" className="mb-3 block text-sm font-semibold text-foreground">
        Subscribe to our newsletter from the CEO
      </label>
      {/* Stacked, not side-by-side — this now lives in a single narrow
          footer column (alongside Social), not a full-width block, so an
          inline input+button would be cramped. */}
      <div className="flex flex-col gap-2">
        <input
          type="email"
          id="EMAIL"
          name="EMAIL"
          autoComplete="off"
          placeholder="you@company.com"
          required
          className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-3 focus:ring-ring/50"
        />
        <button
          type="submit"
          className="h-10 w-full rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/80"
        >
          Subscribe
        </button>
      </div>

      {/* Honeypot + Brevo bookkeeping fields — required by Brevo's backend,
          not shown to real visitors. */}
      <input type="text" name="email_address_check" value="" readOnly hidden />
      <input type="hidden" name="locale" value="en" />
      <input type="hidden" name="html_type" value="simple" />
    </form>
  );
}
