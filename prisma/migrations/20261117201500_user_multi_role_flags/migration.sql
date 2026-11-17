-- Org-wide preference: hide built-in roles on Add user and Edit user.
-- Default on, so new people are assigned from custom roles.
ALTER TABLE "tenants"
ADD COLUMN "hide_system_roles_on_users" BOOLEAN NOT NULL DEFAULT true;

-- First sign-in: send the person to Profile until they choose a new password.
-- Existing users stay false.
ALTER TABLE "users"
ADD COLUMN "must_change_password" BOOLEAN NOT NULL DEFAULT false;
