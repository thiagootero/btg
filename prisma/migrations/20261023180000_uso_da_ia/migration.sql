-- AlterTable
ALTER TABLE `journey_conversation` ADD COLUMN `failedInput` JSON NULL;

-- CreateTable
CREATE TABLE `ai_usage` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `model` VARCHAR(100) NOT NULL,
    `inputTokens` INTEGER NOT NULL DEFAULT 0,
    `outputTokens` INTEGER NOT NULL DEFAULT 0,
    `status` ENUM('SUCCESS', 'INCOMPLETE', 'REFUSED', 'INVALID_RESPONSE', 'TIMEOUT', 'API_ERROR') NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ai_usage_projectId_createdAt_idx`(`projectId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ai_usage` ADD CONSTRAINT `ai_usage_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

