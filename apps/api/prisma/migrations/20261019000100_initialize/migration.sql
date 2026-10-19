CREATE TABLE "AppMetadata" (
    "key" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AppMetadata_pkey" PRIMARY KEY ("key")
);

INSERT INTO "AppMetadata" ("key") VALUES ('initialized');
