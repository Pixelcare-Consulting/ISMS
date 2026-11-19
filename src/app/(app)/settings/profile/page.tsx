import { requireAuth } from "@/lib/auth/permissions";
import { PageHeader } from "@/app/(app)/_components/page-header";
import { ProfileSettingsForm } from "@/features/settings/components/profile-settings-form";
import { profileService } from "@/features/settings/services/profile.service";

export default async function ProfileSettingsPage() {
  const session = await requireAuth();
  const user = await profileService.getProfile(
    session.user.tenantId,
    session.user.id,
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Profile Settings"
        description="Manage your personal account details."
      />
      <ProfileSettingsForm
        initialValues={{
          name: user.name ?? "",
          email: user.email,
          image: user.image,
          department: user.department?.name ?? null,
          roles: user.userRoles.map((userRole) => userRole.role.name),
        }}
      />
    </div>
  );
}
