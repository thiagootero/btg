-- CreateTable
CREATE TABLE `user` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `emailVerified` BOOLEAN NOT NULL DEFAULT false,
    `image` TEXT NULL,
    `platformRole` ENUM('PLATFORM_ADMIN') NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `user_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `session` (
    `id` VARCHAR(191) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `token` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `ipAddress` VARCHAR(191) NULL,
    `userAgent` TEXT NULL,
    `userId` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `session_token_key`(`token`),
    INDEX `session_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `account` (
    `id` VARCHAR(191) NOT NULL,
    `accountId` VARCHAR(191) NOT NULL,
    `providerId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `accessToken` TEXT NULL,
    `refreshToken` TEXT NULL,
    `idToken` TEXT NULL,
    `accessTokenExpiresAt` DATETIME(3) NULL,
    `refreshTokenExpiresAt` DATETIME(3) NULL,
    `scope` TEXT NULL,
    `password` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `account_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `verification` (
    `id` VARCHAR(191) NOT NULL,
    `identifier` VARCHAR(191) NOT NULL,
    `value` TEXT NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `verification_identifier_idx`(`identifier`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `organization` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `isDemo` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `organization_member` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NOT NULL,
    `role` ENUM('ORGANIZATION_ADMIN', 'ORGANIZATION_MEMBER') NOT NULL DEFAULT 'ORGANIZATION_MEMBER',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `organization_member_organizationId_idx`(`organizationId`),
    UNIQUE INDEX `organization_member_userId_organizationId_key`(`userId`, `organizationId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `project` (
    `id` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `area` ENUM('EDUCACAO', 'CULTURA', 'ESPORTE', 'MEIO_AMBIENTE', 'INCLUSAO_PRODUTIVA', 'OUTRA') NOT NULL,
    `areaOther` VARCHAR(191) NULL,
    `targetAudience` TEXT NOT NULL,
    `durationMonths` INTEGER NOT NULL,
    `startDate` DATE NULL,
    `problem` TEXT NOT NULL,
    `strategy` TEXT NOT NULL,
    `journeyStatus` ENUM('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED') NOT NULL DEFAULT 'NOT_STARTED',
    `currentStage` ENUM('CONTEXT', 'ACTIVITIES', 'OUTCOMES', 'IMPACT', 'EVIDENCE_PLAN') NOT NULL DEFAULT 'CONTEXT',
    `isDemo` BOOLEAN NOT NULL DEFAULT false,
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `project_organizationId_idx`(`organizationId`),
    INDEX `project_organizationId_area_idx`(`organizationId`, `area`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `project_territory` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `city` VARCHAR(191) NOT NULL,
    `state` CHAR(2) NOT NULL,
    `order` INTEGER NOT NULL DEFAULT 0,

    INDEX `project_territory_projectId_idx`(`projectId`),
    INDEX `project_territory_state_idx`(`state`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `journey_stage_approval` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `stage` ENUM('CONTEXT', 'ACTIVITIES', 'OUTCOMES', 'IMPACT', 'EVIDENCE_PLAN') NOT NULL,
    `approvedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `approvedById` VARCHAR(191) NULL,

    UNIQUE INDEX `journey_stage_approval_projectId_stage_key`(`projectId`, `stage`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `activity` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `description` TEXT NOT NULL,
    `order` INTEGER NOT NULL,
    `approvalStatus` ENUM('DRAFT', 'APPROVED') NOT NULL DEFAULT 'DRAFT',
    `approvedAt` DATETIME(3) NULL,
    `approvedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `activity_projectId_order_idx`(`projectId`, `order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `activity_target` (
    `id` VARCHAR(191) NOT NULL,
    `activityId` VARCHAR(191) NOT NULL,
    `description` TEXT NOT NULL,
    `deadline` VARCHAR(191) NULL,
    `quantity` DECIMAL(12, 2) NULL,
    `unit` VARCHAR(191) NULL,

    UNIQUE INDEX `activity_target_activityId_key`(`activityId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `activity_indicator` (
    `id` VARCHAR(191) NOT NULL,
    `activityId` VARCHAR(191) NOT NULL,
    `name` TEXT NOT NULL,
    `explanation` TEXT NULL,
    `order` INTEGER NOT NULL DEFAULT 0,

    INDEX `activity_indicator_activityId_idx`(`activityId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `activity_evidence` (
    `id` VARCHAR(191) NOT NULL,
    `activityId` VARCHAR(191) NOT NULL,
    `description` TEXT NOT NULL,
    `order` INTEGER NOT NULL DEFAULT 0,

    INDEX `activity_evidence_activityId_idx`(`activityId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `expected_outcome` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `description` TEXT NOT NULL,
    `target` TEXT NULL,
    `baseline` TEXT NULL,
    `order` INTEGER NOT NULL,
    `approvalStatus` ENUM('DRAFT', 'APPROVED') NOT NULL DEFAULT 'DRAFT',
    `approvedAt` DATETIME(3) NULL,
    `approvedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `expected_outcome_projectId_order_idx`(`projectId`, `order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `outcome_activity` (
    `outcomeId` VARCHAR(191) NOT NULL,
    `activityId` VARCHAR(191) NOT NULL,

    INDEX `outcome_activity_activityId_idx`(`activityId`),
    PRIMARY KEY (`outcomeId`, `activityId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `outcome_indicator` (
    `id` VARCHAR(191) NOT NULL,
    `outcomeId` VARCHAR(191) NOT NULL,
    `name` TEXT NOT NULL,
    `explanation` TEXT NULL,
    `order` INTEGER NOT NULL DEFAULT 0,

    INDEX `outcome_indicator_outcomeId_idx`(`outcomeId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `outcome_evidence` (
    `id` VARCHAR(191) NOT NULL,
    `outcomeId` VARCHAR(191) NOT NULL,
    `description` TEXT NOT NULL,
    `order` INTEGER NOT NULL DEFAULT 0,

    INDEX `outcome_evidence_outcomeId_idx`(`outcomeId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `long_term_impact` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `statement` TEXT NOT NULL,
    `followUpOption` ENUM('VISION_ONLY', 'FOLLOW_UP_CHANGE', 'FUTURE_EVALUATION') NULL,
    `approvalStatus` ENUM('DRAFT', 'APPROVED') NOT NULL DEFAULT 'DRAFT',
    `approvedAt` DATETIME(3) NULL,
    `approvedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `long_term_impact_projectId_key`(`projectId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `impact_follow_up` (
    `id` VARCHAR(191) NOT NULL,
    `impactId` VARCHAR(191) NOT NULL,
    `description` TEXT NOT NULL,
    `target` TEXT NULL,
    `indicator` TEXT NULL,
    `verification` TEXT NULL,
    `periodAfterEnd` VARCHAR(191) NULL,
    `notes` TEXT NULL,
    `order` INTEGER NOT NULL DEFAULT 0,

    INDEX `impact_follow_up_impactId_idx`(`impactId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `evidence_plan_item` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `sourceType` ENUM('ACTIVITY', 'OUTCOME', 'IMPACT') NOT NULL,
    `activityId` VARCHAR(191) NULL,
    `outcomeId` VARCHAR(191) NULL,
    `impactId` VARCHAR(191) NULL,
    `impactFollowUpId` VARCHAR(191) NULL,
    `target` TEXT NULL,
    `indicator` TEXT NULL,
    `verification` TEXT NULL,
    `collectionTiming` TEXT NULL,
    `responsible` VARCHAR(191) NULL,
    `instrument` TEXT NULL,
    `pending` TEXT NULL,
    `order` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `evidence_plan_item_projectId_order_idx`(`projectId`, `order`),
    INDEX `evidence_plan_item_activityId_idx`(`activityId`),
    INDEX `evidence_plan_item_outcomeId_idx`(`outcomeId`),
    INDEX `evidence_plan_item_impactId_idx`(`impactId`),
    INDEX `evidence_plan_item_impactFollowUpId_idx`(`impactFollowUpId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `journey_conversation` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `state` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `journey_conversation_projectId_key`(`projectId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `journey_message` (
    `id` VARCHAR(191) NOT NULL,
    `conversationId` VARCHAR(191) NOT NULL,
    `role` ENUM('ASSISTANT', 'USER') NOT NULL,
    `content` TEXT NOT NULL,
    `stage` ENUM('CONTEXT', 'ACTIVITIES', 'OUTCOMES', 'IMPACT', 'EVIDENCE_PLAN') NOT NULL,
    `actions` JSON NULL,
    `proposalId` VARCHAR(191) NULL,
    `authorId` VARCHAR(191) NULL,
    `isMock` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `journey_message_conversationId_createdAt_idx`(`conversationId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `journey_proposal` (
    `id` VARCHAR(191) NOT NULL,
    `conversationId` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `stage` ENUM('CONTEXT', 'ACTIVITIES', 'OUTCOMES', 'IMPACT', 'EVIDENCE_PLAN') NOT NULL,
    `type` ENUM('ACTIVITY', 'OUTCOME', 'IMPACT', 'EVIDENCE_PLAN') NOT NULL,
    `payload` JSON NOT NULL,
    `status` ENUM('PENDING', 'APPROVED', 'REJECTED', 'SUPERSEDED') NOT NULL DEFAULT 'PENDING',
    `isMock` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `decidedAt` DATETIME(3) NULL,
    `decidedById` VARCHAR(191) NULL,

    INDEX `journey_proposal_projectId_status_idx`(`projectId`, `status`),
    INDEX `journey_proposal_conversationId_idx`(`conversationId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `session` ADD CONSTRAINT `session_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `account` ADD CONSTRAINT `account_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `organization_member` ADD CONSTRAINT `organization_member_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `organization_member` ADD CONSTRAINT `organization_member_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `project` ADD CONSTRAINT `project_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `project_territory` ADD CONSTRAINT `project_territory_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `journey_stage_approval` ADD CONSTRAINT `journey_stage_approval_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `journey_stage_approval` ADD CONSTRAINT `journey_stage_approval_approvedById_fkey` FOREIGN KEY (`approvedById`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `activity` ADD CONSTRAINT `activity_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `activity_target` ADD CONSTRAINT `activity_target_activityId_fkey` FOREIGN KEY (`activityId`) REFERENCES `activity`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `activity_indicator` ADD CONSTRAINT `activity_indicator_activityId_fkey` FOREIGN KEY (`activityId`) REFERENCES `activity`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `activity_evidence` ADD CONSTRAINT `activity_evidence_activityId_fkey` FOREIGN KEY (`activityId`) REFERENCES `activity`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `expected_outcome` ADD CONSTRAINT `expected_outcome_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `outcome_activity` ADD CONSTRAINT `outcome_activity_outcomeId_fkey` FOREIGN KEY (`outcomeId`) REFERENCES `expected_outcome`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `outcome_activity` ADD CONSTRAINT `outcome_activity_activityId_fkey` FOREIGN KEY (`activityId`) REFERENCES `activity`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `outcome_indicator` ADD CONSTRAINT `outcome_indicator_outcomeId_fkey` FOREIGN KEY (`outcomeId`) REFERENCES `expected_outcome`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `outcome_evidence` ADD CONSTRAINT `outcome_evidence_outcomeId_fkey` FOREIGN KEY (`outcomeId`) REFERENCES `expected_outcome`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `long_term_impact` ADD CONSTRAINT `long_term_impact_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `impact_follow_up` ADD CONSTRAINT `impact_follow_up_impactId_fkey` FOREIGN KEY (`impactId`) REFERENCES `long_term_impact`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `evidence_plan_item` ADD CONSTRAINT `evidence_plan_item_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `evidence_plan_item` ADD CONSTRAINT `evidence_plan_item_activityId_fkey` FOREIGN KEY (`activityId`) REFERENCES `activity`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `evidence_plan_item` ADD CONSTRAINT `evidence_plan_item_outcomeId_fkey` FOREIGN KEY (`outcomeId`) REFERENCES `expected_outcome`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `evidence_plan_item` ADD CONSTRAINT `evidence_plan_item_impactId_fkey` FOREIGN KEY (`impactId`) REFERENCES `long_term_impact`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `evidence_plan_item` ADD CONSTRAINT `evidence_plan_item_impactFollowUpId_fkey` FOREIGN KEY (`impactFollowUpId`) REFERENCES `impact_follow_up`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `journey_conversation` ADD CONSTRAINT `journey_conversation_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `journey_message` ADD CONSTRAINT `journey_message_conversationId_fkey` FOREIGN KEY (`conversationId`) REFERENCES `journey_conversation`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `journey_message` ADD CONSTRAINT `journey_message_proposalId_fkey` FOREIGN KEY (`proposalId`) REFERENCES `journey_proposal`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `journey_message` ADD CONSTRAINT `journey_message_authorId_fkey` FOREIGN KEY (`authorId`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `journey_proposal` ADD CONSTRAINT `journey_proposal_conversationId_fkey` FOREIGN KEY (`conversationId`) REFERENCES `journey_conversation`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `journey_proposal` ADD CONSTRAINT `journey_proposal_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `journey_proposal` ADD CONSTRAINT `journey_proposal_decidedById_fkey` FOREIGN KEY (`decidedById`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

