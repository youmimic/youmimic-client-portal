import Script from "next/script";

// Shared by every public-facing layout that should count as site traffic:
// app/(marketing)/layout.tsx, app/login/layout.tsx, app/signup/layout.tsx,
// app/checkout/layout.tsx. Deliberately NOT in the root layout — that would
// wrap /admin and /dashboard too, counting internal staff/customer product
// usage as public site traffic.
const GTM_CONTAINER_ID = "GTM-P85KFN8F";

export function GoogleTagManagerScripts() {
  return (
    <>
      <Script id="gtm" strategy="afterInteractive">
        {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${GTM_CONTAINER_ID}');`}
      </Script>
      <noscript>
        <iframe
          src={`https://www.googletagmanager.com/ns.html?id=${GTM_CONTAINER_ID}`}
          height="0"
          width="0"
          style={{ display: "none", visibility: "hidden" }}
        />
      </noscript>
    </>
  );
}
