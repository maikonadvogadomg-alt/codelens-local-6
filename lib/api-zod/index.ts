/**
 * Regras de conferência dos pedidos — substitui o "@workspace/api-zod"
 * que ficou preso na Replit. Só confere o essencial e deixa passar o resto.
 */
import { z } from "zod";

const loose = <T extends z.ZodRawShape>(shape: T) => z.object(shape).passthrough();
const any = z.any();

export const HealthCheckResponse = loose({ status: z.string() });

export const ListProjectsResponse = any;
export const GetProjectParams = loose({ projectId: z.coerce.string() });
export const GetProjectResponse = any;
export const DeleteProjectParams = loose({ projectId: z.coerce.string() });

export const GetFileContentQueryParams = loose({ path: z.string().min(1) });
export const DeleteFileQueryParams = loose({ path: z.string().min(1) });
export const WriteFileBody = loose({ path: z.string().min(1), content: z.string() });

export const GetSettingsResponse = any;
export const UpdateSettingsResponse = any;
export const UpdateSettingsBody = loose({
  aiApiKey: z.string().nullish(),
  aiBaseUrl: z.string().nullish(),
  aiModel: z.string().nullish(),
  githubToken: z.string().nullish(),
});

export const ExecCommandBody = loose({ command: z.string().min(1) });

export const AiChatBody = loose({
  messages: z.array(loose({ role: z.string(), content: z.string() })),
  fileContext: z.string().nullish(),
  filePath: z.string().nullish(),
  projectId: z.union([z.string(), z.number()]).nullish().transform((v) => (v == null ? v : String(v))),
  projectContext: z.any().optional(),
  terminalContext: z.any().optional(),
});
export const AnalyzeFileBody = loose({
  projectId: z.union([z.string(), z.number()]).transform(String),
  filePath: z.string(),
  content: z.string().optional(),
});
export const AnalyzeFolderBody = loose({
  projectId: z.union([z.string(), z.number()]).transform(String),
  folderPath: z.string().optional().default(""),
});

export const CreateGithubRepoBody = loose({
  projectId: z.union([z.string(), z.number()]).transform(String),
  repoName: z.string().min(1),
  description: z.string().nullish(),
  isPrivate: z.boolean().optional().default(false),
});
export const ImportFromGithubBody = loose({
  repoUrl: z.string().min(1),
  branch: z.string().nullish(),
});
