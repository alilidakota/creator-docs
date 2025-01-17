import Ajv from 'ajv';
import { readFileSync } from 'fs';
import { parse, YAMLParseError } from 'yaml';
import { IConfig } from './config.js';
import { addToSummaryOfRequirements } from './console.js';
import { repositoryRoot } from './files.js';
import { createNewPullRequestComment, requiredCheckMessage } from './github.js';
import { Emoji } from './utils.js';

const ajv = new Ajv.default({ strict: false });

const regex = /reference\/engine\/([^\/]+)\/[^\/]+\.yaml/;

const getApiTypeFromFilePath = (filePath: string): string | undefined => {
  const match = filePath.match(regex);
  return match && match[1] ? match[1] : undefined;
};

// Load a schema from a file and compile it with AJV
const getValidator = (schemaPath: string) => {
  const schema = JSON.parse(readFileSync(schemaPath, 'utf-8'));
  return ajv.compile(schema);
};

const schemaPathMap: Record<string, string> = {
  classes: `${repositoryRoot}/tools/schemas/engine/classes.json`,
  datatypes: `${repositoryRoot}/tools/schemas/engine/datatypes.json`,
  enums: `${repositoryRoot}/tools/schemas/engine/enums.json`,
  globals: `${repositoryRoot}/tools/schemas/engine/globals.json`,
  libraries: `${repositoryRoot}/tools/schemas/engine/libraries.json`,
};

export const checkYamlSchema = ({
  config,
  content,
  filePath,
}: {
  config: IConfig;
  content: string;
  filePath: string;
}) => {
  let data;
  // Parse the YAML
  const yamlData = readFileSync(filePath, 'utf-8');
  try {
    data = parse(yamlData);
  } catch (e: any) {
    const message = `${Emoji.NoEntry} Requirement: In ${filePath}, error parsing YAML: ${e.message}`;
    console.error(message);
    addToSummaryOfRequirements(message);
    if (e instanceof YAMLParseError && config.postPullRequestComments) {
      const commentBody = `Error parsing YAML: ${e.message}

${requiredCheckMessage}`;
      const line = e.linePos ? e.linePos[0].line : 1;
      // const column = e.linePos ? e.linePos[0].col : 1;
      createNewPullRequestComment({
        body: commentBody,
        commit_id: config.commitHash,
        line,
        path: filePath,
        pull_number: config.pullRequestNumber,
        repository: config.repository,
      });
    }
    return;
  }

  // Check the YAML against schema
  const apiType = getApiTypeFromFilePath(filePath);
  if (!apiType) {
    console.log(`No API type found for ${filePath}`);
    return;
  }
  const schemaPath = schemaPathMap[apiType];
  if (!schemaPath) {
    console.log(
      `No validator found for file ${filePath} and API type ${apiType}`
    );
    return;
  }

  const validator = getValidator(schemaPath);
  if (!validator(data)) {
    const validationErrors = JSON.stringify(validator.errors, null, 2);
    const message = `${
      Emoji.NoEntry
    } Requirement: In ${filePath}, error validating YAML against schema ${
      schemaPath.split(repositoryRoot + '/')[1]
    }:
${validationErrors}`;
    console.log(message);
    addToSummaryOfRequirements(message);

    if (config.postPullRequestComments) {
      const commentBody = `Error validating YAML against schema \`${
        schemaPath.split(repositoryRoot + '/')[1]
      }\`:
\`\`\`json
${validationErrors}
\`\`\`
  
${requiredCheckMessage}`;

      createNewPullRequestComment({
        body: commentBody,
        commit_id: config.commitHash,
        line: 1,
        path: filePath,
        pull_number: config.pullRequestNumber,
        repository: config.repository,
        subject_type: 'file',
      });
    }
  }
  return;
};
