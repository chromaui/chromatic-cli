import fs from 'fs-extra';
import pkgUp from 'pkg-up';

const createPackageInfo = async () => {
  return pkgUp(__dirname)
    .then(l => fs.readFile(l, 'utf8'))
    .then(s => JSON.parse(s));
};

const chroma = {
  product: 'Chroma',
  script: 'chroma',
  command: 'chroma publish',
  envVar: 'CHROMA_APP_CODE',
  url: 'https://www.chromaui.com',
};

const chromatic = {
  product: 'chromatic',
  script: 'chromatic',
  command: 'chromatic test',
  envVar: 'CHROMATIC_APP_CODE',
  url: 'https://www.chromaticqa.com',
};

export const getProductVariables = async () => {
  return (await createPackageInfo()).name.includes('chromatic') ? chromatic : chroma;
};
