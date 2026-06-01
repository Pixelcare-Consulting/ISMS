import type { PolicyStatus } from "@/features/policies/constants/policy-status";
import { prisma } from "@/lib/database/client";

const policyInclude = {
  createdBy: { select: { id: true, name: true, email: true } },
  reviewer: { select: { id: true, name: true, email: true } },
  versions: {
    orderBy: { version: "desc" as const },
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
      attachments: {
        include: {
          uploadedBy: { select: { id: true, name: true, email: true } },
        },
      },
    },
  },
  reviewEvents: {
    orderBy: { createdAt: "desc" as const },
    include: {
      user: { select: { id: true, name: true, email: true } },
    },
  },
};

export const policyRepository = {
  listByTenant(tenantId: string, approvedOnly = false) {
    return prisma.policy.findMany({
      where: {
        tenantId,
        deletedAt: null,
        ...(approvedOnly ? { status: "approved" } : {}),
      },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        versions: {
          orderBy: { version: "desc" },
          take: 1,
        },
      },
      orderBy: { updatedAt: "desc" },
    });
  },

  findById(tenantId: string, id: string) {
    return prisma.policy.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: policyInclude,
    });
  },

  listApprovers(tenantId: string) {
    return prisma.user.findMany({
      where: {
        tenantId,
        deletedAt: null,
        userRoles: {
          some: {
            role: {
              deletedAt: null,
              rolePermissions: {
                some: {
                  permission: { slug: "policies.approve" },
                },
              },
            },
          },
        },
      },
      select: { id: true, name: true, email: true },
      orderBy: [{ name: "asc" }, { email: "asc" }],
    });
  },

  create(data: {
    tenantId: string;
    title: string;
    description?: string | null;
    status: PolicyStatus;
    createdById: string;
    content: string;
  }) {
    return prisma.policy.create({
      data: {
        tenantId: data.tenantId,
        title: data.title,
        description: data.description ?? null,
        status: data.status,
        createdById: data.createdById,
        versions: {
          create: {
            version: 1,
            content: data.content,
            status: data.status,
            createdById: data.createdById,
          },
        },
      },
      include: policyInclude,
    });
  },

  updatePolicy(
    tenantId: string,
    policyId: string,
    data: {
      title: string;
      description?: string | null;
      content: string;
      actorUserId: string;
    },
  ) {
    return prisma.$transaction(async (tx) => {
      const policy = await tx.policy.findFirst({
        where: { id: policyId, tenantId, deletedAt: null, status: "draft" },
        include: { versions: { orderBy: { version: "desc" }, take: 1 } },
      });
      if (!policy) {
        return null;
      }

      const latest = policy.versions[0];
      if (!latest || latest.status !== "draft") {
        return null;
      }

      await tx.policy.update({
        where: { id: policyId },
        data: {
          title: data.title,
          description: data.description ?? null,
        },
      });

      await tx.policyVersion.update({
        where: { id: latest.id },
        data: { content: data.content },
      });

      return tx.policy.findFirst({
        where: { id: policyId, tenantId },
        include: policyInclude,
      });
    });
  },

  createRevision(
    tenantId: string,
    policyId: string,
    data: {
      title?: string;
      description?: string | null;
      content: string;
      actorUserId: string;
    },
  ) {
    return prisma.$transaction(async (tx) => {
      const policy = await tx.policy.findFirst({
        where: {
          id: policyId,
          tenantId,
          deletedAt: null,
          status: "approved",
        },
        include: { versions: { orderBy: { version: "desc" }, take: 1 } },
      });
      if (!policy) {
        return null;
      }

      const latest = policy.versions[0];
      const nextVersion = (latest?.version ?? 0) + 1;

      await tx.policy.update({
        where: { id: policyId },
        data: {
          title: data.title ?? policy.title,
          description:
            data.description !== undefined
              ? data.description
              : policy.description,
          status: "draft",
          approvedAt: null,
          reviewerId: null,
        },
      });

      await tx.policyVersion.create({
        data: {
          policyId,
          version: nextVersion,
          content: data.content,
          status: "draft",
          createdById: data.actorUserId,
        },
      });

      return tx.policy.findFirst({
        where: { id: policyId, tenantId },
        include: policyInclude,
      });
    });
  },

  setStatus(
    tenantId: string,
    policyId: string,
    status: PolicyStatus,
    options?: {
      approvedAt?: Date | null;
      reviewerId?: string | null;
    },
  ) {
    return prisma.$transaction(async (tx) => {
      const policy = await tx.policy.updateMany({
        where: { id: policyId, tenantId, deletedAt: null },
        data: {
          status,
          ...(options?.approvedAt !== undefined
            ? { approvedAt: options.approvedAt }
            : {}),
          ...(options?.reviewerId !== undefined
            ? { reviewerId: options.reviewerId }
            : {}),
        },
      });
      if (policy.count === 0) {
        return null;
      }

      const latest = await tx.policyVersion.findFirst({
        where: { policyId },
        orderBy: { version: "desc" },
      });
      if (latest) {
        await tx.policyVersion.update({
          where: { id: latest.id },
          data: { status },
        });
      }

      return tx.policy.findFirst({
        where: { id: policyId, tenantId, deletedAt: null },
        include: policyInclude,
      });
    });
  },

  createReviewEvent(data: {
    policyId: string;
    userId: string;
    action: string;
    comment?: string | null;
  }) {
    return prisma.policyReviewEvent.create({
      data: {
        policyId: data.policyId,
        userId: data.userId,
        action: data.action,
        comment: data.comment ?? null,
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    });
  },

  createAttachment(data: {
    policyVersionId: string;
    fileName: string;
    storagePath: string;
    mimeType: string;
    sizeBytes: number;
    uploadedById: string;
  }) {
    return prisma.policyAttachment.create({
      data,
      include: {
        uploadedBy: { select: { id: true, name: true, email: true } },
      },
    });
  },

  findAttachment(tenantId: string, policyId: string, attachmentId: string) {
    return prisma.policyAttachment.findFirst({
      where: {
        id: attachmentId,
        policyVersion: {
          policyId,
          policy: { tenantId, deletedAt: null },
        },
      },
      include: {
        policyVersion: {
          include: {
            policy: { select: { id: true, title: true, tenantId: true } },
          },
        },
      },
    });
  },

  softDelete(tenantId: string, policyId: string) {
    return prisma.policy.updateMany({
      where: { id: policyId, tenantId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
  },
};
