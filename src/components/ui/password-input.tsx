"use client";

import { Eye, EyeOff } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/utils/cn";

const PasswordInput = React.forwardRef<
  HTMLInputElement,
  React.ComponentProps<typeof Input>
>(({ className, disabled, ...props }, ref) => {
  const [showPassword, setShowPassword] = React.useState(false);

  return (
    <div className="relative">
      <Input
        type={showPassword ? "text" : "password"}
        className={cn("pr-10", className)}
        ref={ref}
        disabled={disabled}
        {...props}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="absolute right-0 top-0 h-full rounded-l-none px-3 hover:bg-transparent"
        onClick={() => setShowPassword((visible) => !visible)}
        disabled={disabled}
        aria-label={showPassword ? "Hide password" : "Show password"}
        aria-pressed={showPassword}
      >
        {showPassword ? (
          <EyeOff className="size-4 text-muted-foreground" aria-hidden />
        ) : (
          <Eye className="size-4 text-muted-foreground" aria-hidden />
        )}
      </Button>
    </div>
  );
});
PasswordInput.displayName = "PasswordInput";

export { PasswordInput };
