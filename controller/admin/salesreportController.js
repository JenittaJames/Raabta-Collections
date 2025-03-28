const orderModel = require("../../models/orderSchema"); // Adjust path as per your project structure
const PDFDocument = require("pdfkit");
const ExcelJS = require("exceljs");

// Daily Sales Report
const dailySalesReport = async (req, res) => {
  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.setDate(now.getDate() - 30)); // Limit to last 30 days

    let dailyReport = await orderModel.aggregate([
      { $match: { createdAt: { $gte: thirtyDaysAgo } } }, // Add date filter
      { $unwind: "$orderedItem" },
      {
        $match: {
          "orderedItem.productStatus": {
            $nin: ["Cancelled", "Pending", "Returned", "Return Requested"],
          },
        },
      },
      {
        $project: {
          day: { $dayOfMonth: "$createdAt" },
          month: { $month: "$createdAt" },
          year: { $year: "$createdAt" },
          orderAmount: "$finalAmount",
          discountAmount: "$discountAmount",
          "orderedItem.quantity": 1,
        },
      },
      // Add this stage to group by orderId first
      {
        $group: {
          _id: {
            orderId: "$_id",
            day: "$day",
            month: "$month",
            year: "$year",
          },
          orderAmount: { $first: "$orderAmount" },
          discountAmount: { $first: "$discountAmount" },
          totalProducts: { $sum: "$orderedItem.quantity" },
        },
      },
      // Now group by date to get the final counts
      {
        $group: {
          _id: {
            day: "$_id.day",
            month: "$_id.month",
            year: "$_id.year",
          },
          totalOrderCount: { $sum: 1 },
          totalSales: { $sum: "$orderAmount" },
          totalProducts: { $sum: "$totalProducts" },
          totalDiscount: { $sum: "$discountAmount" },
        },
      },
      {
        $project: {
          dateFormatted: {
            $concat: [
              { $toString: "$_id.year" },
              "-",
              { $cond: [{ $lt: ["$_id.month", 10] }, { $concat: ["0", { $toString: "$_id.month" }] }, { $toString: "$_id.month" }] },
              "-",
              { $cond: [{ $lt: ["$_id.day", 10] }, { $concat: ["0", { $toString: "$_id.day" }] }, { $toString: "$_id.day" }] },
            ],
          },
          totalSales: 1,
          totalProducts: 1,
          totalOrderCount: 1,
          totalDiscount: 1,
        },
      },
      { $sort: { "dateFormatted": -1 } },
      { $limit: 30 }
    ]);

    const TotalAmount = dailyReport.reduce((acc, curr) => acc + curr.totalSales, 0);
    const TotalSaleCount = dailyReport.reduce((acc, curr) => acc + curr.totalOrderCount, 0);
    const TotalDiscountAmount = dailyReport.reduce((acc, curr) => acc + curr.totalDiscount, 0);

    if (req.query.format === "pdf") {
      const pdfBuffer = await generateSalesReportPdf(dailyReport, "daily", TotalAmount, TotalSaleCount, TotalDiscountAmount, "", "");
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", "attachment;filename=daily_sales_report.pdf");
      res.send(pdfBuffer);
    } else if (req.query.format === "excel") {
      const excelBuffer = await generateSalesReportExcel(dailyReport, "daily", TotalAmount, TotalSaleCount, TotalDiscountAmount, "", "");
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", "attachment;filename=daily_sales_report.xlsx");
      res.send(excelBuffer);
    } else {
      res.render("admin/salesreport", {
        reportData: dailyReport,
        page: "daily",
        TotalAmount,
        TotalSaleCount,
        TotalDiscountAmount,
        fromDate: "",
        toDate: "",
      });
    }
  } catch (error) {
    console.error("Error in daily sales report:", error);
    res.render("admin/servererror");
  }
};


// Weekly Sales Report
const weeklySalesReport = async (req, res) => {
  try {
    const sevenWeeksAgo = new Date(new Date().setDate(new Date().getDate() - 49));

    const weeklyReport = await orderModel.aggregate([
      { $match: { createdAt: { $gte: sevenWeeksAgo } } },
      { $unwind: "$orderedItem" },
      {
        $match: {
          "orderedItem.productStatus": {
            $nin: ["Cancelled", "Pending", "Returned", "Return Requested"],
          },
        },
      },
      {
        $project: {
          week: { $isoWeek: "$createdAt" },
          year: { $isoWeekYear: "$createdAt" },
          orderAmount: "$finalAmount",
          discountAmount: 1,
          "orderedItem.quantity": 1,
        },
      },
      {
        $group: {
          _id: { week: "$week", year: "$year", orderId: "$_id" },
          orderAmount: { $first: "$orderAmount" },
          discountAmount: { $first: "$discountAmount" },
          totalProducts: { $sum: "$orderedItem.quantity" },
        },
      },
      {
        $group: {
          _id: { week: "$_id.week", year: "$_id.year" },
          totalOrderCount: { $sum: 1 },
          totalSales: { $sum: "$orderAmount" },
          totalProducts: { $sum: "$totalProducts" },
          totalDiscount: { $sum: "$discountAmount" },
        },
      },
      {
        $project: {
          week: "$_id.week",
          year: "$_id.year",
          totalOrderCount: 1,
          totalSales: 1,
          totalProducts: 1,
          totalDiscount: 1,
          startOfWeek: {
            $dateToString: {
              format: "%Y-%m-%d",
              date: { $dateFromParts: { isoWeekYear: "$_id.year", isoWeek: "$_id.week", isoDayOfWeek: 1 } },
            },
          },
          endOfWeek: {
            $dateToString: {
              format: "%Y-%m-%d",
              date: { $dateFromParts: { isoWeekYear: "$_id.year", isoWeek: "$_id.week", isoDayOfWeek: 7 } },
            },
          },
        },
      },
      { $sort: { year: 1, week: 1 } },
    ]);

    const TotalAmount = weeklyReport.reduce((acc, curr) => acc + curr.totalSales, 0);
    const TotalSaleCount = weeklyReport.reduce((acc, curr) => acc + curr.totalOrderCount, 0);
    const TotalDiscountAmount = weeklyReport.reduce((acc, curr) => acc + curr.totalDiscount, 0);

    if (req.query.format === "pdf") {
      const pdfBuffer = await generateSalesReportPdf(weeklyReport, "weekly", TotalAmount, TotalSaleCount, TotalDiscountAmount, "", "");
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", "attachment;filename=weekly_sales_report.pdf");
      res.send(pdfBuffer);
    } else if (req.query.format === "excel") {
      const excelBuffer = await generateSalesReportExcel(weeklyReport, "weekly", TotalAmount, TotalSaleCount, TotalDiscountAmount, "", "");
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", "attachment;filename=weekly_sales_report.xlsx");
      res.send(excelBuffer);
    } else {
      res.render("admin/salesreport", {
        reportData: weeklyReport,
        page: "weekly",
        TotalAmount,
        TotalSaleCount,
        TotalDiscountAmount,
        fromDate: "",
        toDate: "",
      });
    }
  } catch (error) {
    console.log("Error in weekly sales report:", error);
    res.render("admin/servererror");
  }
};

// Monthly Sales Report
const monthlySalesReport = async (req, res) => {
  try {
    const twelveMonthsAgo = new Date(new Date().setFullYear(new Date().getFullYear() - 1));

    const monthlyReport = await orderModel.aggregate([
      { $match: { createdAt: { $gte: twelveMonthsAgo } } },
      { $unwind: "$orderedItem" },
      {
        $match: {
          "orderedItem.productStatus": {
            $nin: ["Cancelled", "Pending", "Returned", "Return Requested"],
          },
        },
      },
      {
        $project: {
          month: { $month: "$createdAt" },
          year: { $year: "$createdAt" },
          orderAmount: "$finalAmount",
          discountAmount: 1,
          "orderedItem.quantity": 1,
        },
      },
      {
        $group: {
          _id: { month: "$month", year: "$year", orderId: "$_id" },
          orderAmount: { $first: "$orderAmount" },
          discountAmount: { $first: "$discountAmount" },
          totalProducts: { $sum: "$orderedItem.quantity" },
        },
      },
      {
        $group: {
          _id: { month: "$_id.month", year: "$_id.year" },
          totalOrderCount: { $sum: 1 },
          totalSales: { $sum: "$orderAmount" },
          totalProducts: { $sum: "$totalProducts" },
          totalDiscount: { $sum: "$discountAmount" },
        },
      },
      {
        $project: {
          month: "$_id.month",
          year: "$_id.year",
          totalOrderCount: 1,
          totalSales: 1,
          totalProducts: 1,
          totalDiscount: 1,
          monthName: {
            $arrayElemAt: [
              ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
              { $subtract: ["$_id.month", 1] },
            ],
          },
        },
      },
      { $addFields: { monthYear: { $concat: ["$monthName", "-", { $toString: "$year" }] } } },
      { $sort: { year: 1, month: 1 } },
    ]);

    const TotalAmount = monthlyReport.reduce((acc, curr) => acc + curr.totalSales, 0);
    const TotalSaleCount = monthlyReport.reduce((acc, curr) => acc + curr.totalOrderCount, 0);
    const TotalDiscountAmount = monthlyReport.reduce((acc, curr) => acc + curr.totalDiscount, 0);

    if (req.query.format === "pdf") {
      const pdfBuffer = await generateSalesReportPdf(monthlyReport, "monthly", TotalAmount, TotalSaleCount, TotalDiscountAmount, "", "");
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", "attachment;filename=monthly_sales_report.pdf");
      res.send(pdfBuffer);
    } else if (req.query.format === "excel") {
      const excelBuffer = await generateSalesReportExcel(monthlyReport, "monthly", TotalAmount, TotalSaleCount, TotalDiscountAmount, "", "");
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", "attachment;filename=monthly_sales_report.xlsx");
      res.send(excelBuffer);
    } else {
      res.render("admin/salesreport", {
        reportData: monthlyReport,
        page: "monthly",
        TotalAmount,
        TotalSaleCount,
        TotalDiscountAmount,
        fromDate: "",
        toDate: "",
      });
    }
  } catch (error) {
    console.log("Error in monthly sales report:", error);
    res.render("admin/servererror");
  }
};

// Yearly Sales Report
const yearlySalesReport = async (req, res) => {
  try {
    const yearlyReport = await orderModel.aggregate([
      { $unwind: "$orderedItem" },
      {
        $match: {
          "orderedItem.productStatus": {
            $nin: ["Cancelled", "Pending", "Returned", "Return Requested"],
          },
        },
      },
      {
        $project: {
          year: { $year: "$createdAt" },
          orderAmount: "$finalAmount",
          discountAmount: 1,
          "orderedItem.quantity": 1,
        },
      },
      {
        $group: {
          _id: { year: "$year", orderId: "$_id" },
          orderAmount: { $first: "$orderAmount" },
          discountAmount: { $first: "$discountAmount" },
          totalProducts: { $sum: "$orderedItem.quantity" },
        },
      },
      {
        $group: {
          _id: "$_id.year",
          totalOrderCount: { $sum: 1 },
          totalSales: { $sum: "$orderAmount" },
          totalProducts: { $sum: "$totalProducts" },
          totalDiscount: { $sum: "$discountAmount" },
        },
      },
      {
        $project: {
          year: "$_id",
          totalOrderCount: 1,
          totalSales: 1,
          totalProducts: 1,
          totalDiscount: 1,
        },
      },
      { $sort: { year: 1 } },
    ]);

    const TotalAmount = yearlyReport.reduce((acc, curr) => acc + curr.totalSales, 0);
    const TotalSaleCount = yearlyReport.reduce((acc, curr) => acc + curr.totalOrderCount, 0);
    const TotalDiscountAmount = yearlyReport.reduce((acc, curr) => acc + curr.totalDiscount, 0);

    if (req.query.format === "pdf") {
      const pdfBuffer = await generateSalesReportPdf(yearlyReport, "yearly", TotalAmount, TotalSaleCount, TotalDiscountAmount, "", "");
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", "attachment;filename=yearly_sales_report.pdf");
      res.send(pdfBuffer);
    } else if (req.query.format === "excel") {
      const excelBuffer = await generateSalesReportExcel(yearlyReport, "yearly", TotalAmount, TotalSaleCount, TotalDiscountAmount, "", "");
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", "attachment;filename=yearly_sales_report.xlsx");
      res.send(excelBuffer);
    } else {
      res.render("admin/salesreport", {
        reportData: yearlyReport,
        page: "yearly",
        TotalAmount,
        TotalSaleCount,
        TotalDiscountAmount,
        fromDate: "",
        toDate: "",
      });
    }
  } catch (error) {
    console.log("Error in yearly sales report:", error);
    res.render("admin/servererror");
  }
};

// Custom Date Sales Report
const customDateSalesReport = async (req, res) => {
  try {
    const { fromDate, toDate } = req.body; // Extract from POST request
    if (!fromDate || !toDate) {
      return res.status(400).render("admin/salesreport", {
        reportData: [],
        page: "customDate",
        TotalAmount: 0,
        TotalSaleCount: 0,
        TotalDiscountAmount: 0,
        fromDate: "",
        toDate: "",
        error: "Please provide both From Date and To Date.",
      });
    }

    const startDate = new Date(fromDate);
    const endDate = new Date(toDate);
    endDate.setHours(23, 59, 59, 999); // Include full end date

    if (isNaN(startDate) || isNaN(endDate)) {
      return res.status(400).render("admin/salesreport", {
        reportData: [],
        page: "customDate",
        TotalAmount: 0,
        TotalSaleCount: 0,
        TotalDiscountAmount: 0,
        fromDate,
        toDate,
        error: "Invalid date format.",
      });
    }

    if (endDate < startDate) {
      return res.status(400).render("admin/salesreport", {
        reportData: [],
        page: "customDate",
        TotalAmount: 0,
        TotalSaleCount: 0,
        TotalDiscountAmount: 0,
        fromDate,
        toDate,
        error: "To Date cannot be earlier than From Date.",
      });
    }

    const customReport = await orderModel.aggregate([
      { $match: { createdAt: { $gte: startDate, $lte: endDate } } },
      { $unwind: "$orderedItem" },
      {
        $match: {
          "orderedItem.productStatus": {
            $nin: ["Cancelled", "Pending", "Returned", "Return Requested"],
          },
        },
      },
      {
        $project: {
          day: { $dayOfMonth: "$createdAt" },
          month: { $month: "$createdAt" },
          year: { $year: "$createdAt" },
          orderAmount: "$finalAmount",
          discountAmount: "$discountAmount",
          "orderedItem.quantity": 1,
        },
      },
      {
        $group: {
          _id: {
            orderId: "$_id",
            day: "$day",
            month: "$month",
            year: "$year",
          },
          totalSales: { $first: "$orderAmount" },
          productsCount: { $sum: "$orderedItem.quantity" },
          discountAmount: { $first: "$discountAmount" },
        },
      },
      {
        $group: {
          _id: {
            day: "$_id.day",
            month: "$_id.month",
            year: "$_id.year",
          },
          totalOrderCount: { $sum: 1 },
          totalSales: { $sum: "$totalSales" },
          totalProducts: { $sum: "$productsCount" },
          totalDiscount: { $sum: "$discountAmount" },
        },
      },
      {
        $project: {
          dateFormatted: {
            $concat: [
              { $toString: "$_id.year" },
              "-",
              { $cond: [{ $lt: ["$_id.month", 10] }, { $concat: ["0", { $toString: "$_id.month" }] }, { $toString: "$_id.month" }] },
              "-",
              { $cond: [{ $lt: ["_id.day", 10] }, { $concat: ["0", { $toString: "$_id.day" }] }, { $toString: "$_id.day" }] },
            ],
          },
          totalSales: 1,
          totalProducts: 1,
          totalDiscount: 1,
          totalOrderCount: 1,
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 } },
    ]);

    if (customReport.length === 0) {
      return res.render("admin/salesreport", {
        reportData: [],
        page: "customDate",
        TotalAmount: 0,
        TotalSaleCount: 0,
        TotalDiscountAmount: 0,
        fromDate,
        toDate,
        error: "No data available for the selected date range.",
      });
    }

    const TotalAmount = customReport.reduce((acc, curr) => acc + curr.totalSales, 0);
    const TotalSaleCount = customReport.reduce((acc, curr) => acc + curr.totalOrderCount, 0);
    const TotalDiscountAmount = customReport.reduce((acc, curr) => acc + curr.totalDiscount, 0);

    if (req.query.format === "pdf") {
      const pdfBuffer = await generateSalesReportPdf(customReport, "customDate", TotalAmount, TotalSaleCount, TotalDiscountAmount, fromDate, toDate);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", "attachment;filename=custom_sales_report.pdf");
      res.send(pdfBuffer);
    } else if (req.query.format === "excel") {
      const excelBuffer = await generateSalesReportExcel(customReport, "customDate", TotalAmount, TotalSaleCount, TotalDiscountAmount, fromDate, toDate);
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", "attachment;filename=custom_sales_report.xlsx");
      res.send(excelBuffer);
    } else {
      res.render("admin/salesreport", {
        reportData: customReport,
        page: "customDate",
        TotalAmount,
        TotalSaleCount,
        TotalDiscountAmount,
        fromDate,
        toDate,
        error: null,
      });
    }
  } catch (error) {
    console.log("Error in custom date sales report:", error);
    res.status(500).render("admin/salesreport", {
      reportData: [],
      page: "customDate",
      TotalAmount: 0,
      TotalSaleCount: 0,
      TotalDiscountAmount: 0,
      fromDate: req.body.fromDate || "",
      toDate: req.body.toDate || "",
      error: "An error occurred while generating the report. Please try again.",
    });
  }
};


// PDF Generation Function
const generateSalesReportPdf = (reportData, reportType, totalAmount, totalSaleCount, totalDiscountAmount, fromDate, toDate) => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: "A4" });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.font("Helvetica-Bold").fontSize(24).text("SALES REPORT", { align: "center" });
    doc.moveDown();

    doc.fontSize(12)
      .font("Helvetica")
      .text(`Report Type: ${reportType.charAt(0).toUpperCase() + reportType.slice(1)}`, { align: "left" });

    if (fromDate && toDate) {
      doc.text(`Date Range: ${fromDate} to ${toDate}`, { align: "left" });
    }
    doc.moveDown();

    doc.fontSize(14)
      .font("Helvetica-Bold")
      .text("Summary:", { underline: true });
    doc.fontSize(12)
      .font("Helvetica")
      .text(`Total Sales: ₹${totalAmount.toFixed(2)}`)
      .text(`Total Orders: ${totalSaleCount}`)
      .text(`Total Discount Amount: ₹${totalDiscountAmount.toFixed(2)}`);
    doc.moveDown();

    const table = {
      x: 50,
      y: doc.y + 10,
      width: doc.page.width - 100,
      rowHeight: 30,
      columnWidth: (doc.page.width - 100) / 5,
    };

    drawTableRow(doc, table, ["Date", "Orders", "Sales", "Products", "Discount"], true);

    reportData.forEach((row) => {
      if (table.y > doc.page.height - 50) {
        doc.addPage();
        table.y = 50;
      }
      const rowData = [
        row.dateFormatted || row.monthYear || row.year || `${row.startOfWeek} to ${row.endOfWeek}`,
        row.totalOrderCount.toString(),
        `₹${row.totalSales.toFixed(2)}`,
        row.totalProducts.toString(),
        `₹${row.totalDiscount.toFixed(2)}`,
      ];
      drawTableRow(doc, table, rowData);
    });

    doc.end();

    function drawTableRow(doc, table, rowData, isHeader = false) {
      doc.lineWidth(1)
        .moveTo(table.x, table.y)
        .lineTo(table.x + table.width, table.y)
        .stroke();

      rowData.forEach((text, i) => {
        doc.moveTo(table.x + i * table.columnWidth, table.y)
          .lineTo(table.x + i * table.columnWidth, table.y + table.rowHeight)
          .stroke();

        doc.fillColor(isHeader ? "black" : "gray")
          .font(isHeader ? "Helvetica-Bold" : "Helvetica")
          .fontSize(isHeader ? 12 : 10)
          .text(text, table.x + i * table.columnWidth + 5, table.y + 10, {
            width: table.columnWidth - 10,
            align: "center",
          });
      });

      doc.moveTo(table.x + table.width, table.y)
        .lineTo(table.x + table.width, table.y + table.rowHeight)
        .stroke();

      doc.moveTo(table.x, table.y + table.rowHeight)
        .lineTo(table.x + table.width, table.y + table.rowHeight)
        .stroke();

      table.y += table.rowHeight;
    }
  });
};

// Excel Generation Function
const generateSalesReportExcel = async (reportData, reportType, totalAmount, totalSaleCount, totalDiscountAmount, fromDate, toDate) => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(`${reportType} Sales Report`);

  // Add headers
  worksheet.columns = [
    { header: reportType === "weekly" ? "Start Date" : reportType === "monthly" ? "Month-Year" : reportType === "yearly" ? "Year" : "Date", key: "date", width: 20 },
    { header: "Orders", key: "orders", width: 10 },
    { header: "Sales", key: "sales", width: 15 },
    { header: "Products", key: "products", width: 10 },
    { header: "Discount", key: "discount", width: 15 },
  ];

  // Add rows
  reportData.forEach((row) => {
    worksheet.addRow({
      date: row.dateFormatted || row.monthYear || row.year || `${row.startOfWeek} to ${row.endOfWeek}`,
      orders: row.totalOrderCount,
      sales: `₹${row.totalSales.toFixed(2)}`,
      products: row.totalProducts,
      discount: `₹${row.totalDiscount.toFixed(2)}`,
    });
  });

  // Add summary
  worksheet.addRow([]);
  worksheet.addRow(["Summary", "", "", "", ""]);
  worksheet.addRow(["Total Sales", "", `₹${totalAmount.toFixed(2)}`, "", ""]);
  worksheet.addRow(["Total Orders", "", totalSaleCount, "", ""]);
  worksheet.addRow(["Total Discount", "", `₹${totalDiscountAmount.toFixed(2)}`, "", ""]);
  if (fromDate && toDate) {
    worksheet.addRow(["Date Range", "", `${fromDate} to ${toDate}`, "", ""]);
  }

  // Style the worksheet
  worksheet.getRow(1).font = { bold: true };
  worksheet.getRow(1).alignment = { vertical: "middle", horizontal: "center" };

  const buffer = await workbook.xlsx.writeBuffer();
  return buffer;
};


const checkDataExist = async (req, res) => {
  try {
    const { fromDate, toDate } = req.query;
    const startDate = new Date(fromDate);
    const endDate = new Date(toDate);
    endDate.setHours(23, 59, 59, 999);

    const dataExists = await orderModel.findOne({
      createdAt: { $gte: startDate, $lte: endDate },
      "orderedItem.productStatus": {
        $nin: ["Cancelled", "Pending", "Returned", "Return Requested"],
      },
    });

    if (!dataExists) {
      return res.json({
        success: false,
        message: "No data available for the selected date range.",
      });
    }

    return res.json({ success: true });
  } catch (error) {
    console.error("Error in checkDataExist:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};


module.exports = {
  dailySalesReport,
  weeklySalesReport,
  monthlySalesReport,
  yearlySalesReport,
  customDateSalesReport,
  checkDataExist,
};