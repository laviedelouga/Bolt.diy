import React, { useState } from 'react';
import type { Message } from 'ai';
import { toast } from 'react-toastify';
import { MAX_FILES, isBinaryFile, shouldIncludeFile } from '~/utils/fileUtils';
import { createChatFromFolder } from '~/utils/folderImport';
import { logStore } from '~/lib/stores/logs'; // Assuming logStore is imported from this location

interface ImportFolderButtonProps {
  className?: string;
  importChat?: (description: string, messages: Message[]) => Promise<void>;
}
interface FileWithPath extends File {
  webkitRelativePath: string;
}

export const ImportFolderButton: React.FC<ImportFolderButtonProps> = ({ className, importChat }) => {
  const [isLoading, setIsLoading] = useState(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    let allFiles = Array.from(e.target.files || []) as FileWithPath[];

    const gitignoreFiles = allFiles.filter((file) => file.webkitRelativePath.endsWith('.gitignore'));
    const gitignorePatterns: string[] = ['.git/**', '.git/*', 'node_modules/**', '.env*'];

    // Process all .gitignore files
    for (const gitignoreFile of gitignoreFiles) {
      const gitignoreContent = await gitignoreFile.text();
      const gitignorePath = gitignoreFile.webkitRelativePath;
      const gitignoreDir = gitignorePath.substring(0, gitignorePath.lastIndexOf('/'));

      const patterns = gitignoreContent
        .split('\n')
        .filter((line: string) => line.trim() !== '' && !line.startsWith('#'))
        .map((pattern: string) => {
          // Make pattern relative to the .gitignore location
          if (gitignoreDir) {
            return `${gitignoreDir}/${pattern}`;
          }

          return pattern;
        });

      gitignorePatterns.push(...patterns);
    }

    const isIgnored = (filePath: string) => {
      return gitignorePatterns.some((pattern) => {
        // Convert glob pattern to regex
        const regexPattern = pattern
          .replace(/\./g, '\\.')
          .replace(/\*\*/g, '.*')
          .replace(/\*/g, '[^/]*')
          .replace(/\?/g, '.');
        const regex = new RegExp(`^${regexPattern}$`);

        // Test both the full path and path segments
        const pathSegments = filePath.split('/');

        return (
          regex.test(filePath) ||
          pathSegments.some((_, index) => {
            const partialPath = pathSegments.slice(0, index + 1).join('/');
            return regex.test(partialPath);
          })
        );
      });
    };

    const nonIgnoredFiles = allFiles.filter((file) => !isIgnored(file.webkitRelativePath));
    allFiles = nonIgnoredFiles;

    if (allFiles.length > MAX_FILES) {
      const error = new Error(`Too many files: ${allFiles.length}`);
      logStore.logError('File import failed - too many files', error, {
        fileCount: allFiles.length,
        maxFiles: MAX_FILES,
      });
      toast.error(
        `This folder contains ${allFiles.length.toLocaleString()} files. This product is not yet optimized for very large projects. Please select a folder with fewer than ${MAX_FILES.toLocaleString()} files.`,
      );

      return;
    }

    const folderName = allFiles[0]?.webkitRelativePath.split('/')[0] || 'Unknown Folder';
    setIsLoading(true);

    const loadingToast = toast.loading(`Importing ${folderName}...`);

    try {
      const filteredFiles = allFiles.filter((file) => shouldIncludeFile(file.webkitRelativePath));

      if (filteredFiles.length === 0) {
        const error = new Error('No valid files found');
        logStore.logError('File import failed - no valid files', error, { folderName });
        toast.error('No files found in the selected folder');

        return;
      }

      const fileChecks = await Promise.all(
        filteredFiles.map(async (file) => ({
          file,
          isBinary: await isBinaryFile(file),
        })),
      );

      const textFiles = fileChecks.filter((f) => !f.isBinary).map((f) => f.file);
      const binaryFilePaths = fileChecks
        .filter((f) => f.isBinary)
        .map((f) => f.file.webkitRelativePath.split('/').slice(1).join('/'));

      if (textFiles.length === 0) {
        const error = new Error('No text files found');
        logStore.logError('File import failed - no text files', error, { folderName });
        toast.error('No text files found in the selected folder');

        return;
      }

      if (binaryFilePaths.length > 0) {
        logStore.logWarning(`Skipping binary files during import`, {
          folderName,
          binaryCount: binaryFilePaths.length,
        });
        toast.info(`Skipping ${binaryFilePaths.length} binary files`);
      }

      const messages = await createChatFromFolder(textFiles, binaryFilePaths, folderName);

      if (importChat) {
        await importChat(folderName, [...messages]);
      }

      logStore.logSystem('Folder imported successfully', {
        folderName,
        textFileCount: textFiles.length,
        binaryFileCount: binaryFilePaths.length,
      });
      toast.success('Folder imported successfully');
    } catch (error) {
      logStore.logError('Failed to import folder', error, { folderName });
      console.error('Failed to import folder:', error);
      toast.error('Failed to import folder');
    } finally {
      setIsLoading(false);
      toast.dismiss(loadingToast);
      e.target.value = ''; // Reset file input
    }
  };

  return (
    <>
      <input
        type="file"
        id="folder-import"
        className="hidden"
        webkitdirectory=""
        directory=""
        onChange={handleFileChange}
        {...({} as any)}
      />
      <button
        onClick={() => {
          const input = document.getElementById('folder-import');
          input?.click();
        }}
        className={className}
        disabled={isLoading}
      >
        <div className="i-ph:upload-simple" />
        {isLoading ? 'Importing...' : 'Import Folder'}
      </button>
    </>
  );
};
