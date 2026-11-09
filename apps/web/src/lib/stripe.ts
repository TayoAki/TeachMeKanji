import "server-only";
import Stripe from "stripe";
import { HttpError } from "./server";

export function stripe(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY)
    throw new HttpError(501, "Billing isn't configured on this server.");
  return new Stripe(process.env.STRIPE_SECRET_KEY);
}
