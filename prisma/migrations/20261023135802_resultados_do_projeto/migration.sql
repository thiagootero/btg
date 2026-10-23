-- CreateTable
CREATE TABLE `project_final_evaluation` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `status` ENUM('DRAFT', 'IN_PROGRESS', 'COMPLETED') NOT NULL DEFAULT 'DRAFT',
    `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `completedAt` DATETIME(3) NULL,
    `completedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `project_final_evaluation_projectId_key`(`projectId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `outcome_result_record` (
    `id` VARCHAR(191) NOT NULL,
    `evaluationId` VARCHAR(191) NOT NULL,
    `outcomeId` VARCHAR(191) NULL,
    `order` INTEGER NOT NULL DEFAULT 0,
    `outcomeSnapshot` TEXT NOT NULL,
    `targetSnapshot` TEXT NULL,
    `indicatorSnapshot` TEXT NULL,
    `baselineSnapshot` TEXT NULL,
    `verificationSnapshot` TEXT NULL,
    `indicatorKind` ENUM('PERCENTAGE', 'COUNT', 'TEXT') NULL,
    `denominator` INTEGER NULL,
    `numerator` INTEGER NULL,
    `percentage` DECIMAL(5, 1) NULL,
    `achievedValue` DECIMAL(14, 2) NULL,
    `unit` VARCHAR(80) NULL,
    `achievedText` TEXT NULL,
    `teamPerception` TEXT NULL,
    `additionalContext` TEXT NULL,
    `proposedText` TEXT NULL,
    `proposalIsMock` BOOLEAN NOT NULL DEFAULT false,
    `aiProposedAt` DATETIME(3) NULL,
    `approvedText` TEXT NULL,
    `approvedAt` DATETIME(3) NULL,
    `approvedById` VARCHAR(191) NULL,
    `status` ENUM('DRAFT', 'AI_PROPOSED', 'APPROVED') NOT NULL DEFAULT 'DRAFT',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `outcome_result_record_outcomeId_idx`(`outcomeId`),
    UNIQUE INDEX `outcome_result_record_evaluationId_outcomeId_key`(`evaluationId`, `outcomeId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `project_final_evaluation` ADD CONSTRAINT `project_final_evaluation_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `project_final_evaluation` ADD CONSTRAINT `project_final_evaluation_completedById_fkey` FOREIGN KEY (`completedById`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `outcome_result_record` ADD CONSTRAINT `outcome_result_record_evaluationId_fkey` FOREIGN KEY (`evaluationId`) REFERENCES `project_final_evaluation`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `outcome_result_record` ADD CONSTRAINT `outcome_result_record_outcomeId_fkey` FOREIGN KEY (`outcomeId`) REFERENCES `expected_outcome`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `outcome_result_record` ADD CONSTRAINT `outcome_result_record_approvedById_fkey` FOREIGN KEY (`approvedById`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
