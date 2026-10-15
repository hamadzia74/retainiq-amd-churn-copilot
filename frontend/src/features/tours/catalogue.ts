// Every guided tour, as plain data. Copy is second person and short, because each step is read aloud.
// Tours only explain: no step ever triggers an action (see TourRunner for how clicks are blocked).
import { Cpu, LayoutDashboard, ListFilter, MessageSquare, Target, UserRound, Users } from "lucide-react";
import type { Tour } from "./types";

/** Every path the app can show; tours may only route to these (checked by tests). */
export const APP_ROUTES = ["/", "/customers", "/campaign", "/copilot", "/amd"] as const;

export const TOURS: Tour[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    description: "Revenue at risk, prediction quality and who to save first",
    icon: LayoutDashboard,
    steps: [
      {
        route: "/",
        title: "Welcome to RetainIQ",
        body: "This is your retention overview. It joins orders, support tickets and reviews to show who is likely to stop buying in the next 90 days.",
      },
      {
        target: "kpis",
        title: "Your key numbers",
        body: "Revenue at risk adds up each customer's chance of leaving times what they would spend. High-risk customers are the ones most likely to go.",
      },
      {
        target: "prediction-quality",
        title: "How good the prediction is",
        body: "The grey bar uses order history alone. The green bar adds signals that an LLM on AMD read from tickets and reviews. The gap is what reading customer text adds.",
      },
      {
        target: "complaints",
        title: "Why customers are unhappy",
        body: "These are the complaint types behind your high-risk customers, so you can see which problems cost you the most.",
      },
      {
        target: "top-at-risk",
        title: "Who to save first",
        body: "These five customers have the most revenue at stake. Open any of them to see why they are at risk and what to do.",
      },
    ],
  },
  {
    id: "customers",
    label: "Customers",
    description: "The at-risk list and a single customer's 360 view",
    icon: Users,
    subTours: [
      {
        id: "customers-list",
        label: "At-risk list",
        description: "Filter, sort and read why each customer is at risk",
        icon: ListFilter,
        steps: [
          {
            route: "/customers",
            target: "customer-filters",
            title: "Filter and sort",
            body: "Narrow the list to VIP, regular or occasional customers, and sort by dollars at risk or by probability.",
          },
          {
            target: "customer-risk",
            title: "Churn risk",
            body: "This bar is the model's probability that the customer places no order in the next 90 days. Red means high risk.",
          },
          {
            target: "customer-why",
            title: "Why they are at risk",
            body: "These are the reasons pushing the score up the most, such as recent complaints or a long gap since the last order.",
          },
          {
            target: "customer-row",
            advanceOn: "target-click",
            callout: "Click to open",
            title: "Open a customer",
            body: "Click this customer to open their full 360 view. That ends this tour.",
          },
        ],
      },
      {
        id: "customer-360",
        label: "Customer 360",
        description: "Why one customer may leave and how to win them back",
        icon: UserRound,
        steps: [
          {
            route: "/customers",
            target: "customer-row",
            advanceOn: "target-click",
            callout: "Click to open",
            title: "Pick a customer",
            body: "Let's look at the customer with the most revenue at stake. Click them to open their 360 view.",
          },
          {
            target: "c360-header",
            title: "The customer at a glance",
            body: "Their risk level, revenue at stake and buying habits, all on one card.",
          },
          {
            target: "c360-why",
            title: "Why the model says so",
            body: "Red bars push this customer toward leaving and green bars hold them back. Nothing here is a guess: it is the model's own arithmetic.",
          },
          {
            target: "c360-action",
            title: "The recommended action",
            body: "RetainIQ picks the offer with the best expected return for this customer, and shows the revenue it should save against its cost.",
          },
          {
            target: "c360-winback",
            title: "A personal win-back message",
            body: "When you are ready, this drafts a message in the customer's own language that names their complaint. The tour won't draft one for you.",
          },
          {
            target: "c360-timeline",
            title: "What they told you",
            body: "Every ticket and review from the last six months, with the sentiment, category and any threat to leave that the LLM picked up.",
          },
        ],
      },
    ],
  },
  {
    id: "campaign",
    label: "Campaign planner",
    description: "Turn a marketing budget into the best set of offers",
    icon: Target,
    steps: [
      {
        route: "/campaign",
        target: "budget-slider",
        title: "Set your budget",
        body: "Drag this to choose how much to spend. The plan updates when you let go.",
      },
      {
        target: "campaign-kpis",
        title: "What the budget buys",
        body: "How much you spend, how many customers you reach, the revenue you should save, and your return on that spend.",
      },
      {
        target: "unspent-note",
        title: "Money left on purpose",
        body: "RetainIQ never spends money that won't pay back. If no remaining customer has a profitable offer, the rest stays in your pocket.",
      },
      {
        target: "action-mix",
        title: "The mix of offers",
        body: "How many customers get each kind of offer, from free shipping to a personal call.",
      },
      {
        target: "value-calc",
        title: "How the value is calculated",
        body: "Each offer is scored by the revenue it should save, times your margin, minus its cost. The uplift numbers are assumptions you can replace with your own test results.",
      },
      {
        target: "funded-customers",
        title: "Who gets what",
        body: "Every funded customer with their offer, its cost and the revenue it should save, best value first.",
      },
    ],
  },
  {
    id: "copilot",
    label: "Copilot",
    description: "Ask questions in plain language",
    icon: MessageSquare,
    steps: [
      {
        route: "/copilot",
        target: "starter-prompts",
        title: "Ask anything",
        body: "Start with one of these questions, or type your own. Every number in the answer comes from the churn model and the planner.",
      },
      {
        target: "composer",
        sample: "Which VIP customers are at risk, and why?",
        title: "Type your question",
        body: "Write here and press Enter to send. You can paste an example below; the tour will never send it for you.",
      },
      {
        target: "message-list",
        title: "How answers arrive",
        body: "Answers appear here. Above each one you'll see which tools the Copilot used, so you know where the numbers came from.",
      },
      {
        target: "message-list",
        title: "Long conversations",
        body: "The conversation scrolls on its own as answers arrive. If you scroll up to read, a Jump to latest button brings you back.",
      },
    ],
  },
  {
    id: "amd",
    label: "Powered by AMD",
    description: "Where the AI runs and how churn is predicted",
    icon: Cpu,
    steps: [
      {
        route: "/amd",
        target: "amd-status",
        title: "Where the AI runs",
        body: "The language model runs on AMD GPUs. Here you can see its status, the model, and how much of today's quota is left.",
      },
      {
        target: "amd-pipeline",
        title: "The pipeline",
        body: "The LLM reads customer text, the ML model predicts churn, the optimizer picks offers, and the LLM writes the outreach.",
      },
      {
        target: "amd-enrichment",
        title: "Reading tickets and reviews",
        body: "This sends every ticket and review to the LLM in batches and retrains the model. It uses your AMD quota, so the tour only explains it.",
      },
      {
        target: "amd-model",
        title: "How churn is predicted",
        body: "A classical model, not the LLM, makes the prediction. These weights show what pushes customers toward leaving.",
      },
    ],
  },
];

/** Find a tour (or sub-tour) by id. */
export function findTour(id: string | null): Tour | undefined {
  if (!id) return undefined;
  for (const t of TOURS) {
    if (t.id === id) return t;
    const sub = t.subTours?.find((s) => s.id === id);
    if (sub) return sub;
  }
  return undefined;
}

/** Rough length of a narrated tour in whole minutes (speech at ~2.5 words/s plus a pause per step). */
export function tourMinutes(tour: Tour): number {
  const steps = tour.steps ?? [];
  const words = steps.reduce((n, s) => n + `${s.title} ${s.body}`.split(/\s+/).length, 0);
  return Math.max(1, Math.round((words / 2.5 + steps.length * 3) / 60));
}

/** Every tour that has steps (sub-tours flattened). */
export const runnableTours = (): Tour[] => TOURS.flatMap((t) => (t.subTours ? t.subTours : [t]));
