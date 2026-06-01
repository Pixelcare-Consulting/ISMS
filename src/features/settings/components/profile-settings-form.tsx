"use client";

import { Camera, Loader2 } from "lucide-react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import {
  changePasswordAction,
  updateProfileAction,
} from "@/features/settings/actions/profile.actions";
import { SettingsSection } from "@/features/settings/components/settings-section";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getInitials } from "@/utils/get-initials";
import { processProfileImage } from "@/utils/process-profile-image";

interface ProfileSettingsFormProps {
  initialValues: {
    name: string;
    email: string;
    image: string | null;
    department: string | null;
    roles: string[];
  };
}

export function ProfileSettingsForm({ initialValues }: ProfileSettingsFormProps) {
  const router = useRouter();
  const { update } = useSession();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(initialValues.name);
  const [image, setImage] = useState<string | null>(initialValues.image);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [profilePending, startProfileTransition] = useTransition();
  const [passwordPending, startPasswordTransition] = useTransition();
  const [imagePending, setImagePending] = useState(false);

  async function saveProfile(input: { name: string; image: string | null }) {
    const result = await updateProfileAction(input);

    if (result.error) {
      throw new Error(result.error);
    }

    await update({ name: result.user?.name ?? input.name });
    router.refresh();
    return result;
  }

  async function onImageSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setImagePending(true);

    try {
      const processedImage = await processProfileImage(file);
      setImage(processedImage);

      const result = await saveProfile({ name, image: processedImage });
      toast.success("Profile photo updated", {
        description: "Your new photo is saved.",
      });
      if (result.user?.image) {
        setImage(result.user.image);
      }
    } catch (error) {
      toast.error("Could not update photo", {
        description:
          error instanceof Error ? error.message : "Failed to process image.",
      });
    } finally {
      setImagePending(false);
    }
  }

  async function onRemovePhoto() {
    setImagePending(true);

    try {
      setImage(null);
      await saveProfile({ name, image: null });
      toast.success("Profile photo removed");
    } catch (error) {
      setImage(initialValues.image);
      toast.error("Could not remove photo", {
        description:
          error instanceof Error ? error.message : "Failed to update profile.",
      });
    } finally {
      setImagePending(false);
    }
  }

  function onProfileSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProfileError(null);

    startProfileTransition(async () => {
      try {
        await saveProfile({ name, image });
        toast.success("Profile updated", {
          description: "Your account details were saved.",
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to update profile.";
        setProfileError(message);
        toast.error("Could not save profile", { description: message });
      }
    });
  }

  function onPasswordSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordError(null);

    startPasswordTransition(async () => {
      const result = await changePasswordAction({
        currentPassword,
        newPassword,
        confirmPassword,
      });

      if (result.error) {
        setPasswordError(result.error);
        toast.error("Could not change password", { description: result.error });
        return;
      }

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast.success("Password updated", {
        description: "Use your new password next time you sign in.",
      });
    });
  }

  const isProfileBusy = profilePending || imagePending;

  return (
    <div className="space-y-6">
      <SettingsSection
        title="Profile"
        description="Update your name and profile photo."
      >
        <form onSubmit={onProfileSubmit} className="space-y-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <Avatar className="size-20">
              {image ? (
                <AvatarImage key={image} src={image} alt={name} />
              ) : null}
              <AvatarFallback className="bg-primary/10 text-lg text-primary">
                {getInitials(name || initialValues.email)}
              </AvatarFallback>
            </Avatar>
            <div className="space-y-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                className="hidden"
                onChange={onImageSelect}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={isProfileBusy}
              >
                {imagePending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Camera className="size-4" />
                )}
                {imagePending ? "Uploading…" : "Change photo"}
              </Button>
              {image ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground"
                  onClick={onRemovePhoto}
                  disabled={isProfileBusy}
                >
                  Remove photo
                </Button>
              ) : null}
              <p className="text-xs text-muted-foreground">
                JPEG, PNG, or WebP. Max 512 KB. Saves automatically.
              </p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="profile-name">Full name</Label>
              <Input
                id="profile-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                disabled={isProfileBusy}
                required
                maxLength={80}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="profile-email">Email address</Label>
              <Input
                id="profile-email"
                value={initialValues.email}
                disabled
                readOnly
              />
              <p className="text-xs text-muted-foreground">
                Contact an admin to change your email.
              </p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Department</Label>
              <Input
                value={initialValues.department ?? "—"}
                disabled
                readOnly
              />
            </div>
            <div className="space-y-2">
              <Label>Roles</Label>
              <Input
                value={
                  initialValues.roles.length > 0
                    ? initialValues.roles.join(", ")
                    : "—"
                }
                disabled
                readOnly
              />
            </div>
          </div>

          {profileError ? (
            <p className="text-sm text-destructive">{profileError}</p>
          ) : null}

          <Button type="submit" disabled={isProfileBusy}>
            {profilePending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Saving…
              </>
            ) : (
              "Save profile"
            )}
          </Button>
        </form>
      </SettingsSection>

      <SettingsSection
        title="Password"
        description="Change your login password."
      >
        <form onSubmit={onPasswordSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="current-password">Current password</Label>
              <Input
                id="current-password"
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                disabled={passwordPending}
                autoComplete="current-password"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-password">New password</Label>
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                disabled={passwordPending}
                autoComplete="new-password"
                minLength={8}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm new password</Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                disabled={passwordPending}
                autoComplete="new-password"
                minLength={8}
                required
              />
            </div>
          </div>

          {passwordError ? (
            <p className="text-sm text-destructive">{passwordError}</p>
          ) : null}

          <Button type="submit" variant="secondary" disabled={passwordPending}>
            {passwordPending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Updating…
              </>
            ) : (
              "Update password"
            )}
          </Button>
        </form>
      </SettingsSection>
    </div>
  );
}
