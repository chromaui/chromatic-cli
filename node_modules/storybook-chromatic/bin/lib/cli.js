import fs from 'fs-extra';
import pkgUp from 'pkg-up';

const createPackageInfo = () => {
  const location = pkgUp.sync({ cwd: __dirname });
  const content = fs.readFileSync(location, 'utf8');
  const data = JSON.parse(content);

  return data;
};

const chroma = {
  product: 'chroma',
  script: 'chroma',
  command: 'chroma',
  envVar: 'CHROMA_APP_CODE',
  url: 'https://www.chromaui.com',
};

const chromatic = {
  product: 'chromatic',
  script: 'chromatic',
  command: 'chromatic',
  envVar: 'CHROMATIC_APP_CODE',
  url: 'https://www.chromaticqa.com',
};

export const getProductVariables = () => {
  const { name } = createPackageInfo();

  return name.includes('chromatic') ? chromatic : chroma;
};
