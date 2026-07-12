"use client"

import { useState } from "react"

import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet,
} from "@/components/ui/interfaces-field"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

export default function ComplexFormDemo() {
  const [sameAsShipping, setSameAsShipping] = useState(true)

  return (
    <div className="flex w-full min-h-screen items-center justify-center bg-background p-6 overflow-hidden">
      <div className="w-full max-w-3xl rounded-3xl border bg-background p-6 shadow-sm md:p-8">
        <FieldGroup>
          <FieldSet>
            <div>
              <FieldLegend>Payment Method</FieldLegend>
              <FieldDescription>All transactions are secure and encrypted</FieldDescription>
            </div>

            <Field>
              <FieldLabel htmlFor="card-name">Name on Card</FieldLabel>
              <FieldContent>
                <Input id="card-name" placeholder="Name on Card" defaultValue="David Larsen" />
              </FieldContent>
            </Field>

            <Field>
              <FieldLabel htmlFor="card-number">Card Number</FieldLabel>
              <FieldContent>
                <Input id="card-number" placeholder="Card Number" defaultValue="4242 4242 4242 4242" />
                <FieldDescription>Enter your 16-digit card number</FieldDescription>
              </FieldContent>
            </Field>

            <div className="grid gap-4 md:grid-cols-3">
              <Field>
                <FieldLabel htmlFor="card-month">Month</FieldLabel>
                <FieldContent>
                  <Input id="card-month" placeholder="Month" defaultValue="12" />
                </FieldContent>
              </Field>
              <Field>
                <FieldLabel htmlFor="card-year">Year</FieldLabel>
                <FieldContent>
                  <Input id="card-year" placeholder="Year" defaultValue="2028" />
                </FieldContent>
              </Field>
              <Field>
                <FieldLabel htmlFor="card-cvv">CVV</FieldLabel>
                <FieldContent>
                  <Input id="card-cvv" placeholder="CVV" defaultValue="123" />
                </FieldContent>
              </Field>
            </div>
          </FieldSet>

          <FieldSeparator />

          <FieldSet>
            <div>
              <FieldLegend>Billing Address</FieldLegend>
              <FieldDescription>
                The billing address associated with your payment method
              </FieldDescription>
            </div>

            <Field orientation="horizontal">
              <Checkbox
                id="same-as-shipping"
                checked={sameAsShipping}
                onCheckedChange={(checked) => setSameAsShipping(checked === true)}
              />
              <FieldLabel htmlFor="same-as-shipping">Same as shipping address</FieldLabel>
            </Field>

            <Field>
              <FieldLabel htmlFor="comments">Comments</FieldLabel>
              <FieldContent>
                <Textarea
                  id="comments"
                  placeholder="Comments"
                  defaultValue="Leave delivery instructions for the concierge."
                  className="min-h-28 resize-none"
                />
              </FieldContent>
            </Field>

            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
              >
                Submit
              </button>
              <button
                type="button"
                className="inline-flex h-10 items-center justify-center rounded-md border bg-background px-4 py-2 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                Reset
              </button>
            </div>
          </FieldSet>
        </FieldGroup>
      </div>
    </div>
  )
}
