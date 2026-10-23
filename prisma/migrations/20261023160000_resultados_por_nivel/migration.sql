-- DropForeignKey
ALTER TABLE `outcome_result_record` DROP FOREIGN KEY `outcome_result_record_approvedById_fkey`;

-- DropForeignKey
ALTER TABLE `outcome_result_record` DROP FOREIGN KEY `outcome_result_record_evaluationId_fkey`;

-- DropForeignKey
ALTER TABLE `outcome_result_record` DROP FOREIGN KEY `outcome_result_record_outcomeId_fkey`;

-- AlterTable
ALTER TABLE `project_final_evaluation` ADD COLUMN `formGeneratedAt` DATETIME(3) NULL,
    ADD COLUMN `formSource` VARCHAR(20) NULL,
    ADD COLUMN `formStartedAt` DATETIME(3) NULL,
    ADD COLUMN `formStatus` ENUM('PENDING', 'GENERATING', 'READY') NOT NULL DEFAULT 'PENDING';


-- CreateTable
CREATE TABLE `result_record` (
    `id` VARCHAR(191) NOT NULL,
    `evaluationId` VARCHAR(191) NOT NULL,
    `sourceType` ENUM('ACTIVITY', 'OUTCOME', 'IMPACT') NOT NULL,
    `sourceId` VARCHAR(191) NOT NULL,
    `order` INTEGER NOT NULL DEFAULT 0,
    `itemSnapshot` TEXT NOT NULL,
    `targetSnapshot` TEXT NULL,
    `indicatorSnapshot` TEXT NULL,
    `baselineSnapshot` TEXT NULL,
    `verificationSnapshot` TEXT NULL,
    `periodSnapshot` TEXT NULL,
    `formSpec` JSON NULL,
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

    UNIQUE INDEX `result_record_evaluationId_sourceType_sourceId_key`(`evaluationId`, `sourceType`, `sourceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `result_record` ADD CONSTRAINT `result_record_evaluationId_fkey` FOREIGN KEY (`evaluationId`) REFERENCES `project_final_evaluation`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `result_record` ADD CONSTRAINT `result_record_approvedById_fkey` FOREIGN KEY (`approvedById`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- Copia os registros existentes (resultados de médio prazo) para a nova tabela.
INSERT INTO `result_record` (`id`, `evaluationId`, `sourceType`, `sourceId`, `order`, `itemSnapshot`, `targetSnapshot`,
    `indicatorSnapshot`, `baselineSnapshot`, `verificationSnapshot`, `indicatorKind`, `denominator`, `numerator`,
    `percentage`, `achievedValue`, `unit`, `achievedText`, `teamPerception`, `additionalContext`, `proposedText`,
    `proposalIsMock`, `aiProposedAt`, `approvedText`, `approvedAt`, `approvedById`, `status`, `createdAt`, `updatedAt`)
SELECT `id`, `evaluationId`, 'OUTCOME', COALESCE(`outcomeId`, `id`), `order`, `outcomeSnapshot`, `targetSnapshot`,
    `indicatorSnapshot`, `baselineSnapshot`, `verificationSnapshot`, `indicatorKind`, `denominator`, `numerator`,
    `percentage`, `achievedValue`, `unit`, `achievedText`, `teamPerception`, `additionalContext`, `proposedText`,
    `proposalIsMock`, `aiProposedAt`, `approvedText`, `approvedAt`, `approvedById`, `status`, `createdAt`, `updatedAt`
FROM `outcome_result_record`;

-- DropTable
DROP TABLE `outcome_result_record`;
