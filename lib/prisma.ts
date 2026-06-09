import { PrismaClient } from "@prisma/client";

// 1. Define a helper function to create a new client
const prismaClientSingleton = () => {
  return new PrismaClient({
    datasources: {
      db: {
        // App traffic routes through your POOLED database URL
        url: process.env.DATABASE_URL,
      },
    },
  });
};

// 2. Prevent TypeScript from complaining about the global variable
declare const globalThis: {
  prismaGlobal: ReturnType<typeof prismaClientSingleton>;
} & typeof global;

// 3. Reuse the existing client if it exists, otherwise create a new one
const prisma = globalThis.prismaGlobal ?? prismaClientSingleton();

export default prisma;

// 4. In development mode, save the client to the global scope
if (process.env.NODE_ENV !== "production") globalThis.prismaGlobal = prisma;
