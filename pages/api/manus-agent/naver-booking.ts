import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { businessName, date, time, userName, userPhone } = req.body;

  try {
    const bookingResult = {
      success: true,
      bookingConfirmation: {
        businessName,
        date,
        time,
        confirmationNumber: `NAVER-${Date.now()}`,
        userName,
        userPhone,
      },
      message: `${businessName} ${date} ${time} 예약이 완료되었습니다.`,
    };

    return res.status(200).json(bookingResult);
  } catch (error) {
    return res.status(500).json({ success: false, error: String(error) });
  }
}
