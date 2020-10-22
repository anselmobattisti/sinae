const fs = require("fs")
const placaModel = require("../models/placaModel")
const csvHelper = require("./csvHelper")
const placaHelper = require("./placaHelper")
const frameHelper = require("./frameHelper")
const fileHelper = require("./fileHelper")
const dockerHelper = require("./dockerHelper")
const csv = require("fast-csv")
const {default: PQueue} = require("p-queue")

const analiseHelper = {
	generateFilelists: async (analise) => {
		const analiseId = analise._id
		const analisePath = analise.getLocation()
		const frames = await frameHelper.getFrames({analiseId}, [
			"pocos",
			"tempoMilis",
		])
		const wells = frameHelper.getWells(frames)

		wells.forEach((wellName) => {
			const list = frameHelper.getWellFilelist(wellName, frames)
			const file = `${analisePath}cellprofiler/${wellName}/filelist.csv`
			fileHelper.saveFile(file, list.join("\n"))
		})
	},

	generatePrevnexts: async (analise) => {
		const analiseId = analise._id
		const frames = await frameHelper.getFrames({analiseId}, [
			"pocos",
			"tempoMilis",
		])
		const wells = frameHelper.getWells(frames)
		const milisIncrement = Math.floor(1000 / analise.fps)

		await wells.forEach(async (wellName) => {
			const previousList = frameHelper.getWellFilelist(wellName, frames)
			let list = []

			previousList.forEach((prev) => {
				const milis = prev.substring(
					prev.lastIndexOf("/") + 5,
					prev.lastIndexOf("_seg.")
				)
				const nextMilis = parseInt(milis) + milisIncrement
				const next = prev.replace(
					`_${milis}_seg.`,
					`_${nextMilis}_seg.`
				)
				list.push({Previous: prev, Next: next})
			})

			const analisePath = analise.getLocation()
			const file = `${analisePath}cellprofiler/${wellName}/prevnext.csv`

			await csvHelper.writeToPath(file, list)
		})
	},

	getMotilityResultsFiles: (analise) => {
		const path = analise.getLocation()
		const prefix = "MyExpt_"
		const pathContent = fs.readdirSync(path)
		return pathContent
			.filter((file) => file.indexOf(prefix) == 0)
			.map((file) => `${path}${file}`)
	},

	isMotilityProcessorFinished: async (analise) => {
		let exists = true

		if (analise.pocosProcessados.length < 60) {
			exists = false
		} else {
			const wells = await analiseHelper.getAnaliseWells(analise)
			const files = analiseHelper.getMotilityResultsFiles(analise)

			if (files.length < wells.length * 2) {
				exists = false
			}

			files.forEach((filepath) => {
				if (!fs.existsSync(filepath)) {
					exists = false
				}
			})
		}

		return exists
	},

	getAnaliseWells: async (analise) => {
		const analiseId = analise._id
		const frames = await frameHelper.getFrames({analiseId}, [
			"pocos",
			"tempoMilis",
		])
		return frameHelper.getWells(frames)
	},

	getMotilityFiles: (path) => {
		const prefix = "MyExpt_"
		const allFiles = fs.readdirSync(path)
		return allFiles
			.filter((file) => file.indexOf(prefix) == 0)
			.map((file) => `${path}${file}`)
	},

	mergeMotilityFiles: async (analise) => {
		const wells = await analiseHelper.getAnaliseWells(analise)
		const path = analise.getLocation()
		const files = []

		wells.forEach((wellName) => {
			const wellPath = `${path}cellprofiler/${wellName}/`
			const wellFiles = analiseHelper.getMotilityFiles(wellPath)
			files.push(...wellFiles)
		})

		await csvHelper.mergeFiles(
			files.filter((f) => f.indexOf("_Image") > 0),
			`${path}MyExpt_Image.csv`
		)

		await csvHelper.mergeFiles(
			files.filter((f) => f.indexOf("_FilterObjects_Previous") > 0),
			`${path}MyExpt_FilterObjects_Previous.csv`
		)

		console.log("motility files merged")
	},

	mergeMetadataToResults: async (analise, finishedCallback) => {
		const placa = await placaModel.findOne({
			label: analise.placa,
			experimentoCodigo: analise.experimentoCodigo,
		})
		const metadados = placaHelper.getWellsMetadata(placa)
		const files = await analiseHelper.getMotilityResultsFiles(analise)

		let dataArray = []
		let count = 0

		files.forEach((file) => {
			fs.createReadStream(file)
				.pipe(csv.parse({headers: true}))
				.on("data", function (data) {
					const filename = data["FileName_Previous"]
					const wellName = analiseHelper.getWellFromFilename(filename)
					const wellMetadados = metadados[wellName]

					data["Metadata_Well"] = wellName
					data["Metadata_ExperimentCode"] = analise.experimentoCodigo
					data["Metadata_Plate"] = analise.placa
					data["Metadata_Time"] = analise.tempo

					if (wellMetadados) {
						wellMetadados.forEach((metadado) => {
							const column = "Metadata_" + metadado.nome
							data[column] = metadado.valor
						})
						dataArray.push(data)
					}
				})
				.on("end", function () {
					if (dataArray.length > 0) {
						csvHelper.writeToPath(file, dataArray)
					}

					count += 1
					if (count >= files.length) {
						finishedCallback(files)
					}
				})
		})
	},

	getWellFromFilename: (filename) => {
		let nomePoco = filename.split("_")
		nomePoco = nomePoco[0]
		let letter = nomePoco.slice(0, 1)
		let number = parseInt(nomePoco.slice(1))
		nomePoco = `${letter}${number}`
		return nomePoco
	},

	startMotilityProcessors: async (analise) => {
		const maxSimultaneousContainers = 2
		const analiseId = analise._id
		const frames = await frameHelper.getFrames({analiseId}, [
			"pocos",
			"tempoMilis",
		])
		const wells = frameHelper.getWells(frames)
		const queue = new PQueue({concurrency: maxSimultaneousContainers})
		// queue.on("idle", () => {
		// 	console.log(`Motilidade processada na analise ${analiseId}`)
		// })
		wells.forEach((wellName) => {
			if (!analise.pocosProcessados.includes(wellName)) {
				queue.add(() =>
					analiseHelper.startWellMotilityProcessor(wellName, analise)
				)
			}
		})
	},

	startWellMotilityProcessor: async (wellName, analise) => {
		const projectLocation = "/usr/uploads/settings/pipelines.cpproj"
		const analiseLocation = analise.getLocation()
		const outputLocation = `${analiseLocation}cellprofiler/${wellName}/`
		const filelistLocation = `${outputLocation}filelist.csv`
		const executeComand = `cellprofiler -c -p ${projectLocation} --file-list ${filelistLocation} -o ${outputLocation}`
		const startupParameters = executeComand.split(" ")

		return new Promise((resolve) => {
			dockerHelper
				.runImage("cellprofiler_processor", startupParameters)
				.then(() => {
					if (analise.pocosProcessados) {
						analise.pocosProcessados.push(wellName)
						analise.save()
					}
					resolve()
				})
		})
	},

	resetProcessedMotility: (analise) => {
		analise.pocosProcessados = []
		analise.save()
		const pathToRemove = `${analise.getLocation()}cellprofiler/`
		fileHelper.removeDir(pathToRemove)
	},
}

module.exports = analiseHelper
