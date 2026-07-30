-- A marketplace listing represents a single sale. Enforce that invariant even
-- if two application instances try to finalize the same listing concurrently.
CREATE UNIQUE INDEX "marketplace_transactions_listingId_key"
ON "marketplace_transactions"("listingId");
