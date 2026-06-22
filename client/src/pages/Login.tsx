import { useState } from "react";
import { Loader2, MessageCircle, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { useToast } from "@/hooks/use-toast";
import { useRequestOtp, useVerifyOtp, type VerifyError } from "@/hooks/use-auth";

type Step = "phone" | "otp";

const OTP_LENGTH = 6;

export default function Login() {
  const { toast } = useToast();
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");

  const requestOtp = useRequestOtp();
  const verifyOtp = useVerifyOtp();

  const handleRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone.trim()) return;
    try {
      await requestOtp.mutateAsync(phone.trim());
      setStep("otp");
      setOtp("");
      toast({
        title: "Código enviado",
        description: "Te hemos enviado un código de 6 dígitos por WhatsApp.",
      });
    } catch (err) {
      toast({
        title: "No se pudo enviar el código",
        description: (err as Error).message,
        variant: "destructive",
      });
    }
  };

  const handleVerify = async (value: string) => {
    try {
      await verifyOtp.mutateAsync({ phoneNumber: phone.trim(), otp: value });
      // Al validar, el estado de sesión se invalida y el gate muestra la app.
    } catch (err) {
      const verifyErr = err as VerifyError;
      const left = verifyErr.attemptsLeft;
      toast({
        title: "Código incorrecto",
        description:
          typeof left === "number" && left > 0
            ? `${verifyErr.message} Te quedan ${left} intento(s).`
            : verifyErr.message,
        variant: "destructive",
      });
      setOtp("");
    }
  };

  const handleResend = async () => {
    try {
      await requestOtp.mutateAsync(phone.trim());
      setOtp("");
      toast({ title: "Código reenviado", description: "Revisa tu WhatsApp." });
    } catch (err) {
      toast({
        title: "No se pudo reenviar",
        description: (err as Error).message,
        variant: "destructive",
      });
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-2 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            {step === "phone" ? (
              <MessageCircle className="h-6 w-6 text-primary" />
            ) : (
              <ShieldCheck className="h-6 w-6 text-primary" />
            )}
          </div>
          <CardTitle>
            {step === "phone" ? "Accede a tus citas" : "Introduce el código"}
          </CardTitle>
          <CardDescription>
            {step === "phone"
              ? "Te enviaremos un código de verificación por WhatsApp."
              : `Hemos enviado un código a ${phone}.`}
          </CardDescription>
        </CardHeader>

        <CardContent>
          {step === "phone" ? (
            <form onSubmit={handleRequest} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="phone">Número de teléfono</Label>
                <Input
                  id="phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="+34 600 000 000"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  disabled={requestOtp.isPending}
                  data-testid="input-phone"
                />
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={requestOtp.isPending || !phone.trim()}
                data-testid="button-request-otp"
              >
                {requestOtp.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Enviar código
              </Button>
            </form>
          ) : (
            <div className="space-y-4">
              <div className="flex justify-center">
                <InputOTP
                  maxLength={OTP_LENGTH}
                  value={otp}
                  onChange={(value) => {
                    setOtp(value);
                    if (value.length === OTP_LENGTH) {
                      handleVerify(value);
                    }
                  }}
                  disabled={verifyOtp.isPending}
                  data-testid="input-otp"
                >
                  <InputOTPGroup>
                    {Array.from({ length: OTP_LENGTH }).map((_, i) => (
                      <InputOTPSlot key={i} index={i} />
                    ))}
                  </InputOTPGroup>
                </InputOTP>
              </div>

              {verifyOtp.isPending && (
                <p className="flex items-center justify-center text-sm text-muted-foreground">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Verificando…
                </p>
              )}

              <div className="flex flex-col gap-2 text-center text-sm">
                <button
                  type="button"
                  className="text-primary hover:underline disabled:opacity-50"
                  onClick={handleResend}
                  disabled={requestOtp.isPending || verifyOtp.isPending}
                  data-testid="button-resend-otp"
                >
                  Reenviar código
                </button>
                <button
                  type="button"
                  className="text-muted-foreground hover:underline"
                  onClick={() => {
                    setStep("phone");
                    setOtp("");
                  }}
                  data-testid="button-change-phone"
                >
                  Cambiar número
                </button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
