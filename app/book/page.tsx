"use client"

import { FormEvent, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { CalendarCheck, Clock, Loader2, Shield, Stethoscope } from "lucide-react"
import { branding } from "@/lib/branding"
import { HospitalLogoImage } from "@/components/hospital-logo-image"
import { publicBookingsApi } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import {
  addPublicBooking,
  mapApiBooking,
  PUBLIC_CLINICS,
  PUBLIC_INSURERS,
  type PublicBooking,
} from "@/lib/public-bookings"

const emptyForm = {
  firstName: "",
  lastName: "",
  phone: "",
  nationalId: "",
  shaMemberNumber: "",
  clinic: "Neurosurgery",
  preferredDate: "",
  preferredTime: "09:30",
  reason: "",
  insurance: "AAR",
  website: "",
}

export default function PublicBookingPage() {
  const [form, setForm] = useState(emptyForm)
  const [submitted, setSubmitted] = useState<PublicBooking | null>(null)
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)
  const [embed, setEmbed] = useState(false)
  const [copied, setCopied] = useState(false)
  const [iframeSnippet, setIframeSnippet] = useState("")

  const minDate = useMemo(() => new Date().toISOString().slice(0, 10), [])

  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    setEmbed(q.get("embed") === "1")
    const base = `${window.location.origin}${process.env.NEXT_PUBLIC_BASE_PATH || "/hmis"}`
    setIframeSnippet(
      `<iframe src="${base}/book?embed=1" title="Book an appointment" style="width:100%;min-height:720px;border:0;" loading="lazy"></iframe>`
    )
  }, [])

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError("")
    if (!form.firstName.trim() || !form.lastName.trim() || !form.phone.trim()) {
      setError("Please enter your name and phone number.")
      return
    }
    if (!form.preferredDate) {
      setError("Please choose a preferred date.")
      return
    }
    const payload = {
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      phone: form.phone.trim(),
      nationalId: form.nationalId.trim(),
      shaMemberNumber: form.shaMemberNumber.trim(),
      clinic: form.clinic,
      preferredDate: form.preferredDate,
      preferredTime: form.preferredTime,
      reason: form.reason.trim(),
      insurance: form.insurance,
      website: form.website,
      source: embed ? "iframe" : "web",
    }
    setSaving(true)
    try {
      const created = await publicBookingsApi.create(payload)
      setSubmitted(mapApiBooking(created))
    } catch (err: any) {
      const booking = addPublicBooking({
        firstName: payload.firstName,
        lastName: payload.lastName,
        phone: payload.phone,
        nationalId: payload.nationalId,
        shaMemberNumber: payload.shaMemberNumber,
        clinic: payload.clinic,
        preferredDate: payload.preferredDate,
        preferredTime: payload.preferredTime,
        reason: payload.reason,
        insurance: payload.insurance,
      })
      setSubmitted(booking)
      if (err?.message && !/fetch|network|failed/i.test(String(err.message))) {
        setError("")
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {embed ? null : (
      <header className="border-b">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4">
          <div className="flex items-center gap-3">
            <HospitalLogoImage className="h-10 w-auto" />
            <div>
              <p className="text-sm font-semibold">{branding.appBrand}</p>
              <p className="text-xs text-muted-foreground">Patient appointment request</p>
            </div>
          </div>
          <Button variant="outline" asChild>
            <Link href="/login">Staff sign in</Link>
          </Button>
        </div>
      </header>
      )}

      <main className={embed ? "mx-auto max-w-3xl px-3 py-4" : "mx-auto grid max-w-5xl gap-6 px-4 py-8 lg:grid-cols-[1.1fr_0.9fr]"}>
        <Card>
          <CardHeader>
            <CardTitle>Book a visit</CardTitle>
            <CardDescription>
              Request an OPD or specialist appointment. You will receive an SMS with your code.
              Registration confirms the slot. No account is required.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {submitted ? (
              <div className="space-y-4">
                <div className="rounded-md border bg-muted/40 p-4">
                  <p className="text-sm text-muted-foreground">Your request code</p>
                  <p className="text-3xl font-semibold tracking-wide">{submitted.code}</p>
                </div>
                <p className="text-sm">
                  {submitted.firstName} {submitted.lastName} — {submitted.clinic} on{" "}
                  {submitted.preferredDate} at {submitted.preferredTime}.
                </p>
                <p className="text-sm text-muted-foreground">
                  Present this code at registration. An SMS is sent when Advanta SMS is configured.
                  Staff confirm the slot under Appointments → Online bookings.
                </p>
                {submitted.whatsappUrl ? (
                  <Button variant="outline" asChild>
                    <a href={submitted.whatsappUrl} target="_blank" rel="noreferrer">
                      Message us on WhatsApp
                    </a>
                  </Button>
                ) : null}
                <Button onClick={() => setSubmitted(null)}>Request another visit</Button>
              </div>
            ) : (
              <form className="grid gap-4" onSubmit={onSubmit}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">First name</Label>
                    <Input
                      id="firstName"
                      value={form.firstName}
                      onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                      placeholder="Daniel"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName">Last name</Label>
                    <Input
                      id="lastName"
                      value={form.lastName}
                      onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                      placeholder="Kiptoo"
                    />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone</Label>
                    <Input
                      id="phone"
                      value={form.phone}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                      placeholder="07xx xxx xxx"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="nationalId">National ID (optional)</Label>
                    <Input
                      id="nationalId"
                      value={form.nationalId}
                      onChange={(e) => setForm({ ...form, nationalId: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="shaMemberNumber">SHA / NHIF member number (optional)</Label>
                  <Input
                    id="shaMemberNumber"
                    value={form.shaMemberNumber}
                    onChange={(e) => setForm({ ...form, shaMemberNumber: e.target.value })}
                  />
                </div>
                <div className="hidden" aria-hidden="true">
                  <Label htmlFor="website">Company</Label>
                  <Input
                    id="website"
                    tabIndex={-1}
                    autoComplete="off"
                    value={form.website}
                    onChange={(e) => setForm({ ...form, website: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Clinic / department</Label>
                  <Select value={form.clinic} onValueChange={(clinic) => setForm({ ...form, clinic })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PUBLIC_CLINICS.map((clinic) => (
                        <SelectItem key={clinic} value={clinic}>
                          {clinic}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="preferredDate">Preferred date</Label>
                    <Input
                      id="preferredDate"
                      type="date"
                      min={minDate}
                      value={form.preferredDate}
                      onChange={(e) => setForm({ ...form, preferredDate: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="preferredTime">Preferred time</Label>
                    <Input
                      id="preferredTime"
                      type="time"
                      value={form.preferredTime}
                      onChange={(e) => setForm({ ...form, preferredTime: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Insurance</Label>
                  <Select
                    value={form.insurance}
                    onValueChange={(insurance) => setForm({ ...form, insurance })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PUBLIC_INSURERS.map((insurer) => (
                        <SelectItem key={insurer} value={insurer}>
                          {insurer}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reason">Reason for visit</Label>
                  <Textarea
                    id="reason"
                    rows={3}
                    value={form.reason}
                    onChange={(e) => setForm({ ...form, reason: e.target.value })}
                    placeholder="Symptoms, referral, or follow-up"
                  />
                </div>
                {error ? <p className="text-sm text-destructive">{error}</p> : null}
                <Button type="submit" disabled={saving}>
                  {saving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    "Submit request"
                  )}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>

        <div className={embed ? "hidden" : "space-y-4"}>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">How this works</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p className="flex gap-2">
                <Stethoscope className="mt-0.5 h-4 w-4 shrink-0" />
                Choose the clinic that matches your visit. Neurosurgery, dialysis, and other
                specialist services are listed separately from general OPD.
              </p>
              <p className="flex gap-2">
                <Clock className="mt-0.5 h-4 w-4 shrink-0" />
                Registration confirms the slot against the doctor diary. This is a request, not a
                guaranteed time until staff accept it.
              </p>
              <p className="flex gap-2">
                <CalendarCheck className="mt-0.5 h-4 w-4 shrink-0" />
                Keep your request code. It is used at the desk and appears in the staff Appointments
                inbox. An SMS is sent when messaging is configured.
              </p>
              <p className="flex gap-2">
                <Shield className="mt-0.5 h-4 w-4 shrink-0" />
                Do not enter full medical history here. Clinical notes stay inside the hospital
                system after you arrive.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">For the hospital website</CardTitle>
              <CardDescription>
                Paste this iframe on tophillhospital.com. Use <code className="text-xs">/book?embed=1</code>{" "}
                so the form fits a page section.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <pre className="overflow-x-auto rounded-md border bg-muted/40 p-3 text-xs whitespace-pre-wrap">
                {iframeSnippet}
              </pre>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={async () => {
                  await navigator.clipboard.writeText(iframeSnippet)
                  setCopied(true)
                  setTimeout(() => setCopied(false), 2000)
                }}
              >
                {copied ? "Copied" : "Copy iframe"}
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Hospital</CardTitle>
              <CardDescription>
                Elgon View, Eldoret · 0782 900 090 · Visiting hours 1:00–2:00 pm and 4:00–6:00 pm
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </main>
    </div>
  )
}
