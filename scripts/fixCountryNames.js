const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const ISO_NUMERIC_TO_NAME = {
  '364': 'Iran',
  '528': 'Netherlands',
  '604': 'Peru',
  '818': 'Egypt',
  '490': 'Other',
  '348': 'Hungary',
  '579': 'Norway',
  '699': 'India',
  '156': 'China',
  '276': 'Germany',
  '842': 'United States',
  '704': 'Vietnam',
  '076': 'Brazil',
  '784': 'UAE',
  '702': 'Singapore',
  '251': 'France',
  '381': 'Italy',
  '392': 'Japan',
  '826': 'United Kingdom',
  '792': 'Turkey',
  '360': 'Indonesia',
  '764': 'Thailand',
  '050': 'Bangladesh',
  '586': 'Pakistan',
  '724': 'Spain',
  '620': 'Portugal',
  '752': 'Sweden',
  '756': 'Switzerland',
  '040': 'Austria',
  '056': 'Belgium',
  '643': 'Russia',
  '300': 'Greece',
  '616': 'Poland',
  '208': 'Denmark',
  '246': 'Finland',
};

async function fixCountryNames() {
  console.log('Resolving numeric country codes into full country names...');
  for (const [code, name] of Object.entries(ISO_NUMERIC_TO_NAME)) {
    const updated = await prisma.company.updateMany({
      where: { country: code },
      data: { country: name, countryCode: code },
    });
    if (updated.count > 0) {
      console.log(`Updated ${updated.count} companies for ${code} -> ${name}`);
    }
  }
  console.log('Done!');
  await prisma.$disconnect();
}

fixCountryNames().catch(console.error);
