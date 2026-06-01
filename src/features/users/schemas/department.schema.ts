import { z } from "zod";

export const createDepartmentSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(80),
});

export const updateDepartmentSchema = z.object({
  departmentId: z.string().min(1),
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(80),
});
