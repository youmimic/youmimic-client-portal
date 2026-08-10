-- Admin sidebar "Quick Links" — shared, admin-managed bookmark list.

CREATE TABLE "quick_links" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quick_links_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "quick_links_order_idx" ON "quick_links"("order");
