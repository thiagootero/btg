-- CreateTable
CREATE TABLE `result_indicator` (
    `id` VARCHAR(191) NOT NULL,
    `recordId` VARCHAR(191) NOT NULL,
    `order` INTEGER NOT NULL,
    `name` TEXT NULL,
    `kind` ENUM('PERCENTAGE', 'COUNT', 'TEXT') NULL,
    `denominator` INTEGER NULL,
    `numerator` INTEGER NULL,
    `percentage` DECIMAL(5, 1) NULL,
    `achievedValue` DECIMAL(14, 2) NULL,
    `unit` VARCHAR(80) NULL,
    `achievedText` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `result_indicator_recordId_order_key`(`recordId`, `order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `result_indicator` ADD CONSTRAINT `result_indicator_recordId_fkey` FOREIGN KEY (`recordId`) REFERENCES `result_record`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Um dado por indicador: separa o snapshot "a; b; c" (gravado com esse separador)
-- em linhas. O dado já registrado no item vai para o primeiro indicador.
INSERT INTO `result_indicator` (`id`, `recordId`, `order`, `name`, `kind`, `denominator`, `numerator`, `percentage`,
    `achievedValue`, `unit`, `achievedText`, `createdAt`, `updatedAt`)
WITH RECURSIVE parts (`recordId`, `n`, `name`, `rest`) AS (
    SELECT `id`, 0,
        TRIM(SUBSTRING_INDEX(`indicatorSnapshot`, '; ', 1)),
        IF(LOCATE('; ', `indicatorSnapshot`) > 0, SUBSTRING(`indicatorSnapshot`, LOCATE('; ', `indicatorSnapshot`) + 2), NULL)
    FROM `result_record`
    UNION ALL
    SELECT `recordId`, `n` + 1,
        TRIM(SUBSTRING_INDEX(`rest`, '; ', 1)),
        IF(LOCATE('; ', `rest`) > 0, SUBSTRING(`rest`, LOCATE('; ', `rest`) + 2), NULL)
    FROM parts
    WHERE `rest` IS NOT NULL
)
SELECT CONCAT('ri', LEFT(MD5(CONCAT(p.`recordId`, '-', p.`n`)), 23)), p.`recordId`, p.`n`, NULLIF(p.`name`, ''),
    IF(p.`n` = 0, r.`indicatorKind`, NULL), IF(p.`n` = 0, r.`denominator`, NULL), IF(p.`n` = 0, r.`numerator`, NULL),
    IF(p.`n` = 0, r.`percentage`, NULL), IF(p.`n` = 0, r.`achievedValue`, NULL), IF(p.`n` = 0, r.`unit`, NULL),
    IF(p.`n` = 0, r.`achievedText`, NULL), r.`createdAt`, CURRENT_TIMESTAMP(3)
FROM parts p
JOIN `result_record` r ON r.`id` = p.`recordId`;

-- As perguntas personalizadas passam a ser por indicador: serão geradas de novo.
UPDATE `result_record` SET `formSpec` = NULL;
UPDATE `project_final_evaluation` SET `formStatus` = 'PENDING', `formStartedAt` = NULL, `formGeneratedAt` = NULL, `formSource` = NULL;

-- AlterTable
ALTER TABLE `result_record` DROP COLUMN `achievedText`,
    DROP COLUMN `achievedValue`,
    DROP COLUMN `denominator`,
    DROP COLUMN `indicatorKind`,
    DROP COLUMN `indicatorSnapshot`,
    DROP COLUMN `numerator`,
    DROP COLUMN `percentage`,
    DROP COLUMN `unit`;
