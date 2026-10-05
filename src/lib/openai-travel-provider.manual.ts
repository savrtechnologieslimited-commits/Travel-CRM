import { extractTravelRequirementsWithOpenAI } from "./openai-travel-provider.server";

async function main() {
  const messages = [
    {
      id: "manual-message-1",
      direction: "inbound" as const,
      body: "Hi, I want to visit Bali in December for 4 adults and 2 children. We are travelling from Hyderabad. Budget around 2 lakh. We prefer a good 4 star hotel.",
      message_timestamp: new Date().toISOString(),
    },
  ];

  const result = await extractTravelRequirementsWithOpenAI({ messages });
  console.log(JSON.stringify(result.requirements, null, 2));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown OpenAI manual test failure";
  console.error(message);
  process.exitCode = 1;
});
