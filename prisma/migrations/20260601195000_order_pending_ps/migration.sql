-- Manual order flow: PS review (required) before TL — per Process Flow swimlane diagram
ALTER TYPE "BranchOrderStatus" ADD VALUE IF NOT EXISTS 'pending_ps';
